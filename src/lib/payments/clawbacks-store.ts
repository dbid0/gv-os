import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  paymentAssignments,
  paymentClawbackWaivers,
  paymentEvents,
  paymentRefundLinks,
} from "@/db/schema/app";
import { isClaimRole } from "@/lib/payments/claims";
import {
  validateRefundLink,
  type ClawbackWaiver,
  type RefundLink,
} from "@/lib/payments/clawbacks";

type Result = { ok: true } | { ok: false; reason: string };

export async function listRefundLinks(): Promise<RefundLink[]> {
  const db = getDb();
  return db
    .select({
      refundEventId: paymentRefundLinks.refundEventId,
      chargeEventId: paymentRefundLinks.chargeEventId,
    })
    .from(paymentRefundLinks);
}

export async function listClawbackWaivers(): Promise<ClawbackWaiver[]> {
  const db = getDb();
  return db
    .select({
      refundEventId: paymentClawbackWaivers.refundEventId,
      role: paymentClawbackWaivers.role,
      reason: paymentClawbackWaivers.reason,
    })
    .from(paymentClawbackWaivers);
}

const eventColumns = {
  id: paymentEvents.id,
  kind: paymentEvents.kind,
  clientId: paymentEvents.clientId,
  amountCents: paymentEvents.amountCents,
  occurredAt: paymentEvents.occurredAt,
};

/**
 * Link a refund to the charge it reverses. Runs in one transaction with the
 * charge row locked, so two refunds linked at the same moment can't together
 * refund more than the charge took. A refund already linked must be unlinked
 * first — a link is never silently moved.
 */
export async function linkRefund(
  refundEventId: string,
  chargeEventId: string,
  createdBy: string | null,
): Promise<Result> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [charge] = await tx
      .select(eventColumns)
      .from(paymentEvents)
      .where(eq(paymentEvents.id, chargeEventId))
      .for("update")
      .limit(1);
    const [refund] = await tx
      .select(eventColumns)
      .from(paymentEvents)
      .where(eq(paymentEvents.id, refundEventId))
      .limit(1);
    if (!refund || !charge)
      return { ok: false, reason: "That payment no longer exists." };

    const [existing] = await tx
      .select({ id: paymentRefundLinks.id })
      .from(paymentRefundLinks)
      .where(eq(paymentRefundLinks.refundEventId, refundEventId))
      .limit(1);
    if (existing) {
      return { ok: false, reason: "This refund is already linked. Unlink it first." };
    }

    const siblings = await tx
      .select({ amountCents: paymentEvents.amountCents })
      .from(paymentRefundLinks)
      .innerJoin(paymentEvents, eq(paymentEvents.id, paymentRefundLinks.refundEventId))
      .where(
        and(
          eq(paymentRefundLinks.chargeEventId, chargeEventId),
          ne(paymentRefundLinks.refundEventId, refundEventId),
        ),
      );
    const alreadyRefundedCents = siblings.reduce(
      (s, r) => s + Math.abs(r.amountCents),
      0,
    );

    const verdict = validateRefundLink({ refund, charge, alreadyRefundedCents });
    if (!verdict.ok) return verdict;

    await tx.insert(paymentRefundLinks).values({
      refundEventId,
      chargeEventId,
      clientId: charge.clientId as string,
      createdBy,
    });
    return { ok: true };
  });
}

/** Remove a refund's link, and the waivers that only meant anything with it. */
export async function unlinkRefund(refundEventId: string): Promise<Result> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(paymentRefundLinks)
      .where(eq(paymentRefundLinks.refundEventId, refundEventId))
      .returning({ id: paymentRefundLinks.id });
    if (removed.length === 0) return { ok: false, reason: "This refund isn't linked." };
    await tx
      .delete(paymentClawbackWaivers)
      .where(eq(paymentClawbackWaivers.refundEventId, refundEventId));
    return { ok: true };
  });
}

/**
 * Waive one seat's clawback on a refund. Only a clawback that exists can be
 * waived: the refund must be linked and its charge must carry a claim for the
 * seat. Re-waiving replaces the reason.
 */
export async function waiveClawback(input: {
  refundEventId: string;
  role: string;
  reason: string;
  waivedBy: string | null;
}): Promise<Result> {
  const reason = input.reason.trim();
  if (!isClaimRole(input.role)) return { ok: false, reason: "Unknown seat." };
  if (reason.length < 3 || reason.length > 500) {
    return {
      ok: false,
      reason:
        "Say why in a few words (3 to 500 characters) — a waiver needs its reason.",
    };
  }
  const db = getDb();
  const [link] = await db
    .select({ chargeEventId: paymentRefundLinks.chargeEventId })
    .from(paymentRefundLinks)
    .where(eq(paymentRefundLinks.refundEventId, input.refundEventId))
    .limit(1);
  if (!link) return { ok: false, reason: "Link the refund to its charge first." };
  const [claim] = await db
    .select({ id: paymentAssignments.id })
    .from(paymentAssignments)
    .where(
      and(
        eq(paymentAssignments.paymentEventId, link.chargeEventId),
        eq(paymentAssignments.role, input.role),
      ),
    )
    .limit(1);
  if (!claim) return { ok: false, reason: "Nobody claimed that seat on the charge." };

  await db
    .insert(paymentClawbackWaivers)
    .values({
      refundEventId: input.refundEventId,
      role: input.role,
      reason,
      waivedBy: input.waivedBy,
    })
    .onConflictDoUpdate({
      target: [paymentClawbackWaivers.refundEventId, paymentClawbackWaivers.role],
      set: { reason, waivedBy: input.waivedBy, createdAt: new Date() },
    });
  return { ok: true };
}

export async function unwaiveClawback(
  refundEventId: string,
  role: string,
): Promise<Result> {
  const db = getDb();
  const removed = await db
    .delete(paymentClawbackWaivers)
    .where(
      and(
        eq(paymentClawbackWaivers.refundEventId, refundEventId),
        eq(paymentClawbackWaivers.role, role),
      ),
    )
    .returning({ id: paymentClawbackWaivers.id });
  return removed.length > 0
    ? { ok: true }
    : { ok: false, reason: "No waiver to remove." };
}

/** Charge events for a set of offers, for link suggestions. */
export async function chargesForClients(clientIds: string[]) {
  if (clientIds.length === 0) return [];
  const db = getDb();
  return db
    .select({ ...eventColumns, email: paymentEvents.email, label: paymentEvents.label })
    .from(paymentEvents)
    .where(
      and(inArray(paymentEvents.clientId, clientIds), eq(paymentEvents.kind, "charge")),
    );
}
