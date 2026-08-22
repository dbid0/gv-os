"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { payoutAdjustments, payouts, transactions } from "@/db/schema/app";
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
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
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
