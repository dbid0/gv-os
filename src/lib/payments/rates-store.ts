import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentAssignments, repPercentages } from "@/db/schema/app";
import { CLAIM_ROLES, type ClaimRole } from "@/lib/payments/claims";

/** The priority every seat rule this screen writes carries. */
const DEFAULT_PRIORITY = 100;

/** Every default rate row — the rules feed for the derive. */
export async function listRates() {
  const db = getDb();
  return db
    .select({
      clientId: repPercentages.clientId,
      salesRole: repPercentages.salesRole,
      rateBps: repPercentages.rateBps,
      priority: repPercentages.priority,
    })
    .from(repPercentages);
}

/**
 * Set a client's default seat rates. One rule per (client, seat) at the
 * default priority; a null clears the seat's rule — the seat goes back to
 * UNKNOWN, which derives null commissions rather than zero.
 */
export async function saveClientRates(
  clientId: string,
  rates: Record<ClaimRole, number | null>,
): Promise<void> {
  const db = getDb();
  const keep = CLAIM_ROLES.filter((role) => rates[role] !== null).map((role) => ({
    clientId,
    salesRole: role,
    rateBps: rates[role] as number,
    priority: DEFAULT_PRIORITY,
  }));

  // ONE TRANSACTION, and one statement per side.
  //
  // This used to run a delete and an insert per seat, untransacted: eight
  // round-trips where a failure halfway through left some seats cleared and
  // never rewritten. Those seats read as UNKNOWN, which derives NULL
  // commissions — so a dropped connection mid-save would quietly stop paying
  // a rep, and the screen would still show the rates the operator had typed.
  // A partial write of a money rule is the one outcome worth engineering
  // against.
  await db.transaction(async (tx) => {
    await tx
      .delete(repPercentages)
      .where(
        and(
          eq(repPercentages.clientId, clientId),
          inArray(repPercentages.salesRole, [...CLAIM_ROLES]),
        ),
      );
    // All-null is a valid save: every seat goes back to UNKNOWN.
    if (keep.length > 0) await tx.insert(repPercentages).values(keep);
  });
}

/** Claim rows in the shape the derive engine eats. */
export async function listClaimRows() {
  const db = getDb();
  return db
    .select({
      paymentEventId: paymentAssignments.paymentEventId,
      role: paymentAssignments.role,
      repId: paymentAssignments.repId,
      rateOverrideBps: paymentAssignments.rateOverrideBps,
    })
    .from(paymentAssignments);
}
