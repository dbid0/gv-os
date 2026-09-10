/**
 * Commission derivation — the pure heart of the payout engine.
 *
 * Commissions are NEVER stored. They derive, on read, from three facts that
 * are: the payment (its cents), the claim (whose seat), and the rate (an
 * override on the claim, else the client's rule for that seat). Change a
 * rate and every affected number recomputes; there is no stale stored copy
 * to reconcile.
 *
 * Money rules, tested:
 * - Override beats rule. A claim with neither derives a NULL rate and a NULL
 *   commission — an unset rate is unknown, not zero, and rendering $0.00 for
 *   it would tell a rep they earned nothing when the truth is nobody said.
 * - Refunds derive NEGATIVE commissions with the same rate resolution — the
 *   clawback seed. A refund with an unknown rate is null, like any unknown.
 * - Integer cents: Math.round(amount × bps / 10000), computed per row.
 */

import type { ClaimRole } from "@/lib/payments/claims";

export type CommissionPayment = {
  id: string;
  amountCents: number;
  /** charge · refund · unknown */
  kind: string;
  clientId: string | null;
};

export type CommissionClaim = {
  paymentEventId: string;
  role: ClaimRole | string;
  repId: string;
  rateOverrideBps: number | null;
};

export type CommissionRule = {
  salesRole: string;
  rateBps: number;
  priority: number;
};

export type CommissionRow = {
  paymentEventId: string;
  repId: string;
  role: string;
  /** The resolved rate; null = no override and no rule — unknown. */
  rateBps: number | null;
  /** Signed integer cents; negative for refunds; null when the rate is unknown. */
  commissionCents: number | null;
};

/** Lowest priority number wins per role — the future rule layers slot in above. */
export function resolveRate(
  claim: CommissionClaim,
  rules: CommissionRule[],
): number | null {
  if (claim.rateOverrideBps !== null) return claim.rateOverrideBps;
  const forRole = rules
    .filter((r) => r.salesRole === claim.role)
    .sort((a, b) => a.priority - b.priority);
  return forRole.length > 0 ? forRole[0].rateBps : null;
}

export function deriveCommissions(
  payments: CommissionPayment[],
  claims: CommissionClaim[],
  rules: CommissionRule[],
): CommissionRow[] {
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const rows: CommissionRow[] = [];
  for (const claim of claims) {
    const payment = paymentById.get(claim.paymentEventId);
    if (!payment) continue; // a claim on a payment outside the window is not this window's row
    const rateBps = resolveRate(claim, rules);
    const sign = payment.kind === "refund" ? -1 : 1;
    rows.push({
      paymentEventId: payment.id,
      repId: claim.repId,
      role: claim.role,
      rateBps,
      commissionCents:
        rateBps === null
          ? null
          : sign * Math.round((Math.abs(payment.amountCents) * rateBps) / 10000),
    });
  }
  return rows;
}

export type RepCommissionTotal = {
  repId: string;
  /** Sum of the DERIVABLE rows only. */
  totalCents: number;
  /** Rows whose rate was unknown — shown, never guessed into the total. */
  unknownRateRows: number;
};

export function totalsByRep(rows: CommissionRow[]): RepCommissionTotal[] {
  const byRep = new Map<string, RepCommissionTotal>();
  for (const row of rows) {
    const acc = byRep.get(row.repId) ?? {
      repId: row.repId,
      totalCents: 0,
      unknownRateRows: 0,
    };
    if (row.commissionCents === null) acc.unknownRateRows += 1;
    else acc.totalCents += row.commissionCents;
    byRep.set(row.repId, acc);
  }
  return [...byRep.values()].sort((a, b) => b.totalCents - a.totalCents);
}
