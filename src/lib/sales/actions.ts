"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { clients, commissionSplits, deals, reps } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { fromDollars } from "@/lib/money";
import { percentToBps } from "@/lib/splits";

/**
 * Sales write layer.
 *
 * Every mutation runs through here as a Server Action: it re-checks the signed-
 * in user against the allowlist (the form's own check is a courtesy; THIS is the
 * gate), validates input with zod, converts dollars and percents into integer
 * cents and basis points at the boundary, and writes. Logging a deal is one
 * transaction so the deal, its ledger payment, and its splits never land half
 * done. Cash is recorded as a ledger event, never a column, so the derived
 * numbers can't drift.
 */

async function requireUser() {
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) {
    throw new Error("Not authorized.");
  }
  return user;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const pctToBps = (p: number | undefined) => (p === undefined ? null : percentToBps(p));
const dollarsToCents = (v: string | undefined) =>
  v && v.trim() !== "" ? fromDollars(v) : null;

// ---------------------------------------------------------------- Teams

const teamInput = z.object({
  name: z.string().min(1, "A team needs a name."),
  defaultCloserPct: z.number().min(0).max(100).optional(),
  defaultSetterPct: z.number().min(0).max(100).optional(),
  defaultDmSetterPct: z.number().min(0).max(100).optional(),
  defaultManagerPct: z.number().min(0).max(100).optional(),
  deductProcessorFees: z.boolean().optional(),
  processorFeePct: z.number().min(0).max(100).optional(),
  processorFeeFlat: z.string().optional(),
});

export async function createTeam(raw: z.input<typeof teamInput>) {
  await requireUser();
  const input = teamInput.parse(raw);
  const db = getDb();
  const [team] = await db
    .insert(clients)
    .values({
      name: input.name,
      slug: slugify(input.name),
      status: "active",
      defaultCloserBps: pctToBps(input.defaultCloserPct),
      defaultSetterBps: pctToBps(input.defaultSetterPct),
      defaultDmSetterBps: pctToBps(input.defaultDmSetterPct),
      defaultManagerBps: pctToBps(input.defaultManagerPct),
      deductProcessorFees: input.deductProcessorFees ?? false,
      processorFeeBps: pctToBps(input.processorFeePct),
      processorFeeFlatCents: dollarsToCents(input.processorFeeFlat),
    })
    .returning();
  revalidatePath("/sales/teams");
  revalidatePath("/sales");
  return { id: team.id };
}

// ---------------------------------------------------------------- Reps

const repInput = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1, "A rep needs a name."),
  role: z.enum(["closer", "setter", "dm_setter", "manager"]),
  commissionPct: z.number().min(0).max(100).optional(),
  basePay: z.string().optional(),
  topLineSkimPct: z.number().min(0).max(100).optional(),
});

export async function createRep(raw: z.input<typeof repInput>) {
  await requireUser();
  const input = repInput.parse(raw);
  const db = getDb();
  const [rep] = await db
    .insert(reps)
    .values({
      clientId: input.clientId,
      name: input.name,
      role: input.role,
      commissionBps: pctToBps(input.commissionPct),
      basePayCents: dollarsToCents(input.basePay),
      topLineSkimBps: pctToBps(input.topLineSkimPct),
      status: "active",
    })
    .returning();
  revalidatePath("/sales/teams");
  revalidatePath("/sales/commissions");
  return { id: rep.id };
}

// ---------------------------------------------------------------- Deals

const splitInput = z.object({
  repId: z.string().uuid(),
  role: z.enum(["closer", "setter", "dm_setter", "manager"]),
  ratePct: z.number().min(0).max(100),
  bonus: z.string().optional(),
});

const dealInput = z.object({
  clientId: z.string().uuid(),
  customerName: z.string().optional(),
  closingRepId: z.string().uuid().optional(),
  source: z.string().optional(),
  leadSource: z.string().optional(),
  recurrence: z.enum(["one_time", "recurring"]).optional(),
  dealType: z.string().default("Other"),
  contractValue: z.string(),
  cashCollected: z.string(),
  splits: z.array(splitInput).default([]),
});

export async function logDeal(raw: z.input<typeof dealInput>) {
  await requireUser();
  const input = dealInput.parse(raw);
  const db = getDb();
  const contractCents = fromDollars(input.contractValue);
  const cashCents = fromDollars(input.cashCollected);

  const dealId = await db.transaction(async (tx) => {
    const [deal] = await tx
      .insert(deals)
      .values({
        clientId: input.clientId,
        dealType: input.dealType,
        contractValueCents: contractCents,
        repId: input.closingRepId ?? null,
        customerName: input.customerName ?? null,
        source: input.source ?? null,
        leadSource: input.leadSource ?? null,
        recurrence: input.recurrence ?? null,
        closedAt: new Date(),
        agreementSigned: "yes",
      })
      .returning();

    if (cashCents > 0) {
      await tx.insert(moneyEvents).values({
        occurredAt: new Date(),
        eventType: "payment_received",
        amountCents: cashCents,
        clientId: input.clientId,
        dealId: deal.id,
        source: "sales.logDeal",
        idempotencyKey: `deal:${deal.id}:initial`,
      });
    }

    if (input.splits.length > 0) {
      await tx.insert(commissionSplits).values(
        input.splits.map((s) => ({
          dealId: deal.id,
          repId: s.repId,
          role: s.role,
          rateBps: percentToBps(s.ratePct),
          basis: "cash_collected" as const,
          bonusCents: dollarsToCents(s.bonus),
        })),
      );
    }

    return deal.id;
  });

  revalidatePath("/sales/deals");
  revalidatePath("/sales/commissions");
  revalidatePath("/sales");
  return { id: dealId };
}
