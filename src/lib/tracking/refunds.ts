/**
 * MONEY THAT CAME BACK.
 *
 * A payment log that cannot express a refund overstates cash by whatever has
 * been refunded, permanently and invisibly. The Grid's sheet is in exactly
 * that state today: 77 payment rows, zero negatives, no "refunded" status,
 * and about $2,497 known to have gone back out — $1,500 on Shopify and $997
 * on Stripe — with nowhere to record it.
 *
 * No convention has been settled for how a refund gets written down, so this
 * accepts every shape one plausibly takes rather than forcing a choice:
 *
 *   • a NEGATIVE amount on the row (the accounting instinct)
 *   • a STATUS saying refunded, refund, chargeback or reversed (the
 *     processor's own vocabulary — Stripe and Shopify both use these words)
 *   • a positive amount on a row whose status says it was refunded, which is
 *     what a processor export usually looks like: the original charge with
 *     its state changed
 *
 * Whichever appears, a refund SUBTRACTS. The one thing that must never happen
 * is a refunded charge counting as cash collected, which is the failure mode
 * that makes a month look better than it was.
 *
 * Pure: no clock, no database.
 */

export interface PaymentLike {
  cashCents: number | null;
  status: string | null;
}

/** Status words a processor uses when money went back. */
const REFUND_WORDS =
  /(refund|chargeback|charge_back|reversed|reversal|disputed|returned)/i;

/** Status words that mean the money never arrived in the first place. */
const FAILED_WORDS = /(failed|declined|cancell?ed|expired|incomplete|voided)/i;

export type PaymentOutcome = "collected" | "refunded" | "failed";

/**
 * What actually happened to this payment.
 *
 * A failed charge is not a refund — nothing came in, so nothing goes back out.
 * Counting it either way would be wrong, so it is classified apart and
 * excluded from both totals.
 */
export function classifyPayment(row: PaymentLike): PaymentOutcome {
  const status = row.status ?? "";
  if (REFUND_WORDS.test(status)) return "refunded";
  if (FAILED_WORDS.test(status)) return "failed";
  // A negative amount is a refund however the status reads — an accountant
  // writing -1500 means it went back, whatever the row says beside it.
  if ((row.cashCents ?? 0) < 0) return "refunded";
  return "collected";
}

export interface PaymentTotals {
  /** What arrived, before anything went back. */
  grossCents: number;
  /** What went back out. Always POSITIVE — the sign lives in the label. */
  refundedCents: number;
  /** Gross minus refunds. The figure a month should be judged on. */
  netCents: number;
  /** Charges that never completed. Counted in neither total. */
  failedCents: number;
  collectedCount: number;
  refundedCount: number;
  failedCount: number;
}

export function totalPayments(rows: PaymentLike[]): PaymentTotals {
  const t: PaymentTotals = {
    grossCents: 0,
    refundedCents: 0,
    netCents: 0,
    failedCents: 0,
    collectedCount: 0,
    refundedCount: 0,
    failedCount: 0,
  };

  for (const row of rows) {
    const amount = Math.abs(row.cashCents ?? 0);
    switch (classifyPayment(row)) {
      case "refunded":
        t.refundedCents += amount;
        t.refundedCount += 1;
        break;
      case "failed":
        t.failedCents += amount;
        t.failedCount += 1;
        break;
      default:
        t.grossCents += amount;
        t.collectedCount += 1;
    }
  }
  t.netCents = t.grossCents - t.refundedCents;
  return t;
}
