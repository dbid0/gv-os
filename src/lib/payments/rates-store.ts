import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentAssignments, repPercentages } from "@/db/schema/app";
import { CLAIM_ROLES, type ClaimRole } from "@/lib/payments/claims";

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
  for (const role of CLAIM_ROLES) {
    const bps = rates[role];
    await db
      .delete(repPercentages)
      .where(
        and(eq(repPercentages.clientId, clientId), eq(repPercentages.salesRole, role)),
      );
    if (bps !== null) {
      await db.insert(repPercentages).values({
        clientId,
        salesRole: role,
        rateBps: bps,
        priority: 100,
      });
    }
  }
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
