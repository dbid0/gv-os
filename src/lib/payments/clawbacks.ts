/**
 * CLAWBACKS — commission given back when the money is.
 *
 * A rep earns commission on a charge they claimed. When that money is refunded,
 * the commission on the refunded part comes back. Like commissions, clawbacks
 * are NEVER stored: they derive on read from the refund, the charge it was
 * deliberately linked to, the claims on that charge, and the same rate
 * resolution the commission used (override beats rule). Change a rate and the
 * clawback recomputes with the commission.
 *
 * Money rules, tested:
 * - Only a LINKED refund claws back. An unlinked refund derives nothing, and
 *   is reported as unlinked — never matched to a charge by guesswork.
 * - A link is same-offer, refund → charge, and can never make the refunds on a
 *   charge add up to more than the charge took.
 * - Clawback = −round(|refund| × rate / 10000) per claimed seat, so a partial
 *   refund claws back proportionally. Unknown rate → null, never zero.
 * - A waiver keeps the row visible and takes it out of the total, with its
 *   reason carried alongside.
 * - Integer cents throughout.
 *
 * Pure: no database.
 */

import {
  resolveRate,
  type CommissionClaim,
  type CommissionRow,
  type CommissionRule,
} from "@/lib/payments/commissions";

export type LinkablePayment = {
  id: string;
  kind: string;
  clientId: string | null;
  /** Signed as stored: charges positive, refunds usually negative. */
  amountCents: number;
  occurredAt: Date | null;
  email?: string | null;
};

export type RefundLinkVerdict = { ok: true } | { ok: false; reason: string };

/**
 * May this refund be linked to this charge? `alreadyRefundedCents` is the sum
 * of refunds (magnitudes) already linked to the charge, excluding this refund.
 */
export function validateRefundLink(input: {
  refund: LinkablePayment;
  charge: LinkablePayment;
  alreadyRefundedCents: number;
}): RefundLinkVerdict {
  const { refund, charge } = input;
  if (refund.id === charge.id) {
    return { ok: false, reason: "A refund can't be linked to itself." };
  }
  if (refund.kind !== "refund") {
    return { ok: false, reason: "Only a refund can claw back commission." };
  }
  if (charge.kind !== "charge") {
    return { ok: false, reason: "A refund can only be linked to a charge." };
  }
  if (refund.clientId === null || refund.clientId !== charge.clientId) {
    return {
      ok: false,
      reason: "The refund and the charge belong to different offers.",
    };
  }
  if (refund.occurredAt && charge.occurredAt && refund.occurredAt < charge.occurredAt) {
    return { ok: false, reason: "That charge happened after this refund." };
  }
  const refundCents = Math.abs(refund.amountCents);
  const chargeCents = Math.abs(charge.amountCents);
  if (input.alreadyRefundedCents + refundCents > chargeCents) {
    return {
      ok: false,
      reason:
        "Linking this would refund more than the charge took. Check it's the right charge.",
    };
  }
  return { ok: true };
}

/**
 * Charges this refund could reverse, best first: same offer, before the refund,
 * big enough to cover it after refunds already linked, the payer's own email
 * first, then the closest amount, then the most recent.
 */
export function suggestCharges(
  refund: LinkablePayment,
  charges: LinkablePayment[],
  refundedByCharge: Map<string, number>,
  limit = 8,
): LinkablePayment[] {
  const refundCents = Math.abs(refund.amountCents);
  const email = refund.email?.trim().toLowerCase() ?? null;
  return charges
    .filter(
      (c) =>
        validateRefundLink({
          refund,
          charge: c,
          alreadyRefundedCents: refundedByCharge.get(c.id) ?? 0,
        }).ok,
    )
    .sort((a, b) => {
      const aMine = email !== null && a.email?.trim().toLowerCase() === email ? 0 : 1;
      const bMine = email !== null && b.email?.trim().toLowerCase() === email ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      const aGap = Math.abs(a.amountCents) - refundCents;
      const bGap = Math.abs(b.amountCents) - refundCents;
      if (aGap !== bGap) return aGap - bGap;
      return (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0);
    })
    .slice(0, limit);
}

export type RefundLink = { refundEventId: string; chargeEventId: string };
export type ClawbackWaiver = { refundEventId: string; role: string; reason: string };

export type ClawbackRow = {
  refundEventId: string;
  chargeEventId: string;
  repId: string;
  role: string;
  rateBps: number | null;
  /** Negative integer cents; null when the seat's rate is unknown. */
  clawbackCents: number | null;
  waived: boolean;
  waiverReason: string | null;
};

export function deriveClawbacks(input: {
  refunds: LinkablePayment[];
  links: RefundLink[];
  /** Claims on the linked charges. */
  claims: CommissionClaim[];
  /** Rate rules for the refunds' offer. */
  rules: CommissionRule[];
  waivers: ClawbackWaiver[];
}): ClawbackRow[] {
  const chargeFor = new Map(input.links.map((l) => [l.refundEventId, l.chargeEventId]));
  const waiverFor = new Map(
    input.waivers.map((w) => [`${w.refundEventId}:${w.role}`, w.reason]),
  );
  const rows: ClawbackRow[] = [];
  for (const refund of input.refunds) {
    if (refund.kind !== "refund") continue;
    const chargeEventId = chargeFor.get(refund.id);
    if (!chargeEventId) continue;
    for (const claim of input.claims.filter(
      (c) => c.paymentEventId === chargeEventId,
    )) {
      const rateBps = resolveRate(claim, input.rules);
      const reason = waiverFor.get(`${refund.id}:${claim.role}`) ?? null;
      rows.push({
        refundEventId: refund.id,
        chargeEventId,
        repId: claim.repId,
        role: claim.role,
        rateBps,
        clawbackCents:
          rateBps === null
            ? null
            : -Math.round((Math.abs(refund.amountCents) * rateBps) / 10000),
        waived: reason !== null,
        waiverReason: reason,
      });
    }
  }
  return rows;
}

/**
 * Clawbacks as commission rows for the rep totals: waived rows leave, unknown
 * rates stay unknown (so the total says how many it couldn't price).
 */
export function clawbacksAsCommissionRows(rows: ClawbackRow[]): CommissionRow[] {
  return rows
    .filter((r) => !r.waived)
    .map((r) => ({
      paymentEventId: r.refundEventId,
      repId: r.repId,
      role: r.role,
      rateBps: r.rateBps,
      commissionCents: r.clawbackCents,
    }));
}

export type ClawbackSummary = {
  /** Clawbacks that count (not waived, rate known). */
  counted: number;
  countedCents: number;
  waived: number;
  waivedCents: number;
  unknownRate: number;
};

export function summarizeClawbacks(rows: ClawbackRow[]): ClawbackSummary {
  const summary: ClawbackSummary = {
    counted: 0,
    countedCents: 0,
    waived: 0,
    waivedCents: 0,
    unknownRate: 0,
  };
  for (const r of rows) {
    if (r.clawbackCents === null) {
      summary.unknownRate += 1;
      continue;
    }
    if (r.waived) {
      summary.waived += 1;
      summary.waivedCents += r.clawbackCents;
    } else {
      summary.counted += 1;
      summary.countedCents += r.clawbackCents;
    }
  }
  return summary;
}

/** Sum of linked refund magnitudes per charge — the over-refund guard's input. */
export function refundedByCharge(
  links: RefundLink[],
  refunds: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of links) {
    const cents = Math.abs(refunds.get(l.refundEventId) ?? 0);
    out.set(l.chargeEventId, (out.get(l.chargeEventId) ?? 0) + cents);
  }
  return out;
}
