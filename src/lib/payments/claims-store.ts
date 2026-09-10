import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentAssignments, paymentEvents, reps } from "@/db/schema/app";
import { validateClaim, type ClaimRole } from "@/lib/payments/claims";

/**
 * The claims write layer. The payment row is the authority for scope — the
 * caller only ever names the payment, the seat, and the rep; client scope is
 * read from the database, never trusted from a form. Claims replace per
 * (payment, seat) via the unique index's conflict target.
 */
export async function claimPayment(input: {
  paymentEventId: string;
  role: string;
  repId: string;
  rateOverrideBps: number | null;
  createdBy: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const [[payment], [rep]] = await Promise.all([
    db
      .select({ id: paymentEvents.id, clientId: paymentEvents.clientId })
      .from(paymentEvents)
      .where(eq(paymentEvents.id, input.paymentEventId))
      .limit(1),
    db
      .select({ id: reps.id, clientId: reps.clientId })
      .from(reps)
      .where(eq(reps.id, input.repId))
      .limit(1),
  ]);
  if (!payment) return { ok: false, reason: "Unknown payment." };
  if (!rep) return { ok: false, reason: "Unknown rep." };

  const verdict = validateClaim({
    role: input.role,
    rateOverrideBps: input.rateOverrideBps,
    paymentClientId: payment.clientId,
    repClientId: rep.clientId,
  });
  if (!verdict.ok) return verdict;

  await db
    .insert(paymentAssignments)
    .values({
      paymentEventId: payment.id,
      clientId: payment.clientId,
      role: verdict.role,
      repId: rep.id,
      rateOverrideBps: input.rateOverrideBps,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [paymentAssignments.paymentEventId, paymentAssignments.role],
      set: {
        repId: rep.id,
        rateOverrideBps: input.rateOverrideBps,
        createdBy: input.createdBy,
        createdAt: new Date(),
      },
    });
  return { ok: true };
}

export async function unclaimPayment(
  paymentEventId: string,
  role: ClaimRole,
): Promise<void> {
  const db = getDb();
  await db
    .delete(paymentAssignments)
    .where(
      and(
        eq(paymentAssignments.paymentEventId, paymentEventId),
        eq(paymentAssignments.role, role),
      ),
    );
}

/** Every claim for one client, newest first, for joining against payments. */
export async function listClaims(clientId: string) {
  const db = getDb();
  return db
    .select({
      id: paymentAssignments.id,
      paymentEventId: paymentAssignments.paymentEventId,
      role: paymentAssignments.role,
      repId: paymentAssignments.repId,
      rateOverrideBps: paymentAssignments.rateOverrideBps,
      createdAt: paymentAssignments.createdAt,
    })
    .from(paymentAssignments)
    .where(eq(paymentAssignments.clientId, clientId))
    .orderBy(desc(paymentAssignments.createdAt));
}

/** All claims with rep display names, keyed by payment id — the page's join. */
export async function claimsByPayment(): Promise<
  Map<string, { role: string; repName: string }[]>
> {
  const db = getDb();
  const rows = await db
    .select({
      paymentEventId: paymentAssignments.paymentEventId,
      role: paymentAssignments.role,
      repName: reps.name,
    })
    .from(paymentAssignments)
    .innerJoin(reps, eq(paymentAssignments.repId, reps.id));
  const map = new Map<string, { role: string; repName: string }[]>();
  for (const r of rows) {
    const list = map.get(r.paymentEventId) ?? [];
    list.push({ role: r.role, repName: r.repName });
    map.set(r.paymentEventId, list);
  }
  return map;
}

/** Active reps grouped by client, for the per-row seat pickers. */
export async function repsByClient(): Promise<
  Map<string, { id: string; name: string }[]>
> {
  const db = getDb();
  const rows = await db
    .select({ id: reps.id, name: reps.name, clientId: reps.clientId })
    .from(reps);
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const list = map.get(r.clientId) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.clientId, list);
  }
  return map;
}
