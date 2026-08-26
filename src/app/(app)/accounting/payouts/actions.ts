"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  clients,
  payoutAdjustments,
  payouts,
  revShareRules,
  transactions,
} from "@/db/schema/app";
import { revShareLines } from "@/lib/revshare/engine";
import { getAdSpendByMonth } from "@/lib/revshare/ad-spend-query";
import { assemblePartnerSplit, assembleRevShareRun } from "@/lib/payouts/run";
import { agencyLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import {
  PAYOUT_KINDS,
  payoutDealType,
  payoutDirection,
  payoutTotalCents,
} from "@/lib/payouts/math";
import { dayKeyCT } from "@/lib/charts";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const createInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  kind: z.enum(PAYOUT_KINDS),
  label: z.string().min(1).max(200),
  amountDollars: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().max(500).optional(),
});

export async function createPayout(raw: unknown) {
  await requireUser();
  const input = createInput.parse(raw);
  const db = getDb();
  await db.insert(payouts).values({
    month: input.month,
    kind: input.kind,
    label: input.label,
    baseCents: Math.round(input.amountDollars * 100),
    notes: input.notes?.trim() || null,
  });
  revalidatePath("/accounting/payouts");
  return { ok: true };
}

/**
 * Generate this month's payout run: turn each client's computed rev-share into
 * a pending `revshare_received` receivable. Idempotent — re-running never
 * doubles a client's row. The 50/50 partner split + rep commissions layer on
 * this in follow-ups.
 */
export async function generatePayoutRun(rawMonth?: string) {
  await requireUser();
  const month =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth)
      ? rawMonth
      : dayKeyCT(new Date()).slice(0, 7);

  const db = getDb();
  const [rules, rows, clientRows, existing, existingPartner, { rows: backlog }] =
    await Promise.all([
      db
        .select({
          clientId: revShareRules.clientId,
          rateBps: revShareRules.rateBps,
          effectiveFrom: revShareRules.effectiveFrom,
          deductAdSpend: revShareRules.deductAdSpend,
        })
        .from(revShareRules),
      db
        .select({
          clientId: transactions.clientId,
          direction: transactions.direction,
          layer: transactions.layer,
          occurredOn: transactions.occurredOn,
          cashCents: transactions.cashCents,
          processorFeeCents: transactions.processorFeeCents,
        })
        .from(transactions)
        .where(eq(transactions.layer, "client")),
      db.select({ id: clients.id, name: clients.name }).from(clients),
      db
        .select({ clientId: payouts.clientId })
        .from(payouts)
        .where(and(eq(payouts.month, month), eq(payouts.kind, "revshare_received"))),
      db
        .select({ id: payouts.id })
        .from(payouts)
        .where(and(eq(payouts.month, month), eq(payouts.kind, "partner"))),
      listTransactions({}),
    ]);

  const nameFor = (id: string) => clientRows.find((c) => c.id === id)?.name ?? "Client";
  const lines = revShareLines(rows, rules, await getAdSpendByMonth());
  const owed = lines
    .filter((l) => l.month === month)
    .map((l) => ({
      clientId: l.clientId,
      clientName: nameFor(l.clientId),
      revShareCents: l.revShareCents,
    }));
  const existingIds = new Set(
    existing.map((e) => e.clientId).filter((x): x is string => Boolean(x)),
  );

  // Rev-share receivables (money in) + the 50/50 partner split of GV's
  // undistributed net (money out to Daniel + Gus). The split uses the same net
  // the agency ledger derives, so it can never disagree with the P&L.
  const netCents = agencyLedger(backlog).chain.netCents;
  const drafts = [
    ...assembleRevShareRun(month, owed, existingIds),
    ...assemblePartnerSplit(month, netCents, existingPartner.length > 0),
  ];
  if (drafts.length > 0) {
    await db.insert(payouts).values(drafts);
  }
  revalidatePath("/accounting/payouts");
  return { created: drafts.length, month };
}

const adjustInput = z.object({
  payoutId: z.string().uuid(),
  label: z.string().min(1).max(200),
  deltaDollars: z.coerce.number().min(-10_000_000).max(10_000_000),
});

export async function addAdjustment(raw: unknown) {
  await requireUser();
  const input = adjustInput.parse(raw);
  const db = getDb();
  const [payout] = await db
    .select({ status: payouts.status })
    .from(payouts)
    .where(eq(payouts.id, input.payoutId))
    .limit(1);
  if (!payout) throw new Error("No such payout.");
  if (payout.status === "paid") {
    throw new Error("Paid payouts don't change — add a reversing backlog row.");
  }
  await db.insert(payoutAdjustments).values({
    payoutId: input.payoutId,
    label: input.label,
    deltaCents: Math.round(input.deltaDollars * 100),
  });
  revalidatePath("/accounting/payouts");
  return { ok: true };
}

/**
 * Marking paid is the money moment: the matching backlog transaction is
 * written FIRST (idempotent on the payout id — a double click can never
 * double-write), then the tracker row flips. One-way by design.
 */
export async function markPayoutPaid(payoutId: string) {
  await requireUser();
  if (!z.string().uuid().safeParse(payoutId).success) {
    throw new Error("Bad payout id.");
  }
  const db = getDb();
  const [payout] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, "pending")))
    .limit(1);
  if (!payout) throw new Error("No pending payout with that id.");
  const adjustments = await db
    .select({ deltaCents: payoutAdjustments.deltaCents })
    .from(payoutAdjustments)
    .where(eq(payoutAdjustments.payoutId, payoutId));
  const totalCents = payoutTotalCents(payout.baseCents, adjustments);

  const inserted = await db
    .insert(transactions)
    .values({
      occurredOn: dayKeyCT(new Date()),
      occurredAt: new Date(),
      direction: payoutDirection(payout.kind),
      layer: "agency",
      clientId: payout.clientId,
      dealType: payoutDealType(payout.kind),
      description: payout.label,
      cashCents: totalCents,
      source: "manual",
      idempotencyKey: `payout:${payout.id}`,
      notes: payout.notes,
    })
    .onConflictDoNothing({ target: [transactions.idempotencyKey] })
    .returning({ id: transactions.id });

  const [existing] = inserted.length
    ? inserted
    : await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.idempotencyKey, `payout:${payout.id}`))
        .limit(1);

  await db
    .update(payouts)
    .set({ status: "paid", paidAt: new Date(), transactionId: existing?.id ?? null })
    .where(eq(payouts.id, payoutId));
  revalidatePath("/accounting/payouts");
  return { ok: true };
}
