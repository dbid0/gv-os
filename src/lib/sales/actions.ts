"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  activityReports,
  clients,
  commissionSplits,
  deals,
  eodTemplates,
  reps,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { fromDollars } from "@/lib/money";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getPaidRepIds,
} from "@/lib/sales/queries";
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
  // Build phase: auth is off (see middleware DISABLE_AUTH), so the write
  // actions must not gate either. Flip DISABLE_AUTH off to restore the check.
  if (process.env.DISABLE_AUTH === "true") return null;
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

// ---------------------------------------------------------------- EOD Templates

const customFieldInput = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["number", "currency", "text"]),
  showOnDashboard: z.boolean().optional(),
});

const calcFieldInput = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  format: z.enum(["number", "percent", "currency"]),
  numerator: z.string().min(1),
  denominator: z.string().min(1),
  showOnDashboard: z.boolean().optional(),
});

const eodTemplateInput = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1, "A template needs a name."),
  role: z.enum(["closer", "setter", "dm_setter", "manager"]),
  cadence: z.enum(["eod", "eow", "bod"]).default("eod"),
  baseFields: z.array(z.string()).default([]),
  customFields: z.array(customFieldInput).default([]),
  calcFields: z.array(calcFieldInput).default([]),
});

export async function createEodTemplate(raw: z.input<typeof eodTemplateInput>) {
  await requireUser();
  const input = eodTemplateInput.parse(raw);
  const db = getDb();
  const [template] = await db
    .insert(eodTemplates)
    .values({
      clientId: input.clientId,
      name: input.name,
      role: input.role,
      cadence: input.cadence,
      baseFields: input.baseFields,
      customFields: input.customFields,
      calcFields: input.calcFields,
      isActive: true,
    })
    .returning();
  revalidatePath("/sales/templates");
  return { id: template.id };
}

// ---------------------------------------------------------------- Submit EOD

const submitEodInput = z.object({
  repId: z.string().uuid(),
  /** ISO date (YYYY-MM-DD) the report covers. */
  reportDate: z.string().min(1),
  cadence: z.enum(["eod", "eow", "bod"]).default("eod"),
  dayOff: z.boolean().default(false),
  /** Numeric activity counts, keyed by base/custom field key. */
  metrics: z.record(z.string(), z.number()).default({}),
  notes: z.string().optional(),
  /** Closer-only: when cash is logged, a deal is auto-created (RepVision's wiring). */
  cashCollected: z.string().optional(),
  revenue: z.string().optional(),
});

export async function submitEod(raw: z.input<typeof submitEodInput>) {
  await requireUser();
  const input = submitEodInput.parse(raw);
  const db = getDb();
  const [rep] = await db.select().from(reps).where(eq(reps.id, input.repId)).limit(1);
  if (!rep) throw new Error("Unknown rep.");

  const reportDate = new Date(`${input.reportDate}T12:00:00Z`);
  const metrics = input.dayOff ? { day_off: 1 } : input.metrics;

  await db.transaction(async (tx) => {
    // One report per rep + date + cadence. Re-submitting is a no-op rather than
    // a duplicate — the external ref carries the identity.
    await tx
      .insert(activityReports)
      .values({
        repId: rep.id,
        clientId: rep.clientId,
        reportDate,
        kind: input.cadence,
        metrics,
        notes: input.notes ?? null,
        externalRef: `eod:${rep.id}:${input.reportDate}:${input.cadence}`,
      })
      .onConflictDoNothing();

    // A closer who logs cash collected auto-creates a deal + its ledger payment,
    // the same way RepVision turns a closer's EOD into a deal. The cash lives in
    // the ledger, never on the deal, so the derived numbers can't drift.
    const cashCents =
      !input.dayOff && rep.role === "closer" && input.cashCollected?.trim()
        ? fromDollars(input.cashCollected)
        : 0;
    if (cashCents > 0) {
      const revenueCents =
        input.revenue && input.revenue.trim() !== ""
          ? fromDollars(input.revenue)
          : cashCents;
      const [deal] = await tx
        .insert(deals)
        .values({
          clientId: rep.clientId,
          dealType: "Other",
          contractValueCents: revenueCents,
          repId: rep.id,
          recurrence: "one_time",
          source: "eod",
          closedAt: reportDate,
          agreementSigned: "yes",
          notes: `Auto-created from ${rep.name}'s EOD ${input.reportDate}`,
          externalRef: `eod-deal:${rep.id}:${input.reportDate}`,
        })
        .onConflictDoNothing()
        .returning();
      if (deal) {
        await tx.insert(moneyEvents).values({
          occurredAt: reportDate,
          eventType: "payment_received",
          amountCents: cashCents,
          clientId: rep.clientId,
          dealId: deal.id,
          source: "sales.submitEod",
          idempotencyKey: `eod-deal:${deal.id}:cash`,
        });
      }
    }
  });

  revalidatePath("/sales/eod");
  revalidatePath("/sales/commissions");
  revalidatePath("/sales");
  return { ok: true };
}

// ---------------------------------------------------------------- Payouts

/**
 * Mark a rep paid for the current month. The amount is RECOMPUTED here from the
 * commission rollup — never taken from the client — and recorded as a `payout`
 * ledger event (money out, negative). Idempotent per rep + period, so a double
 * click can't double-pay. "Paid" is then derived from the event's existence.
 */
export async function markRepPaid(repId: string) {
  await requireUser();
  const id = z.string().uuid().parse(repId);
  const period = currentPayoutPeriod();
  const rollup = await getCommissionRollup("cash_collected");
  const line = rollup.reps.find((r) => r.repId === id);
  if (!line) throw new Error("No owed line for this rep.");

  const db = getDb();
  const [rep] = await db
    .select({ clientId: reps.clientId })
    .from(reps)
    .where(eq(reps.id, id))
    .limit(1);

  await db
    .insert(moneyEvents)
    .values({
      occurredAt: new Date(),
      eventType: "payout",
      amountCents: -line.totalOwedCents,
      clientId: rep?.clientId ?? null,
      repId: id,
      source: "sales.markPaid",
      idempotencyKey: `payout:${id}:${period}`,
      payload: { period, owed: line.totalOwedCents },
    })
    .onConflictDoNothing();

  revalidatePath("/sales/commissions");
  return { ok: true };
}

/** Mark every rep with a positive balance paid for the current month. */
export async function markAllPaid() {
  await requireUser();
  const period = currentPayoutPeriod();
  const rollup = await getCommissionRollup("cash_collected");
  const paid = await getPaidRepIds(period);
  const owed = rollup.reps.filter((r) => !paid.has(r.repId) && r.totalOwedCents > 0);
  if (owed.length === 0) return { ok: true, count: 0 };

  const db = getDb();
  const clientByRep = new Map(
    (
      await db
        .select({ id: reps.id, clientId: reps.clientId })
        .from(reps)
        .where(
          inArray(
            reps.id,
            owed.map((r) => r.repId),
          ),
        )
    ).map((r) => [r.id, r.clientId]),
  );

  await db
    .insert(moneyEvents)
    .values(
      owed.map((r) => ({
        occurredAt: new Date(),
        eventType: "payout" as const,
        amountCents: -r.totalOwedCents,
        clientId: clientByRep.get(r.repId) ?? null,
        repId: r.repId,
        source: "sales.markPaid",
        idempotencyKey: `payout:${r.repId}:${period}`,
        payload: { period, owed: r.totalOwedCents },
      })),
    )
    .onConflictDoNothing();

  revalidatePath("/sales/commissions");
  return { ok: true, count: owed.length };
}
