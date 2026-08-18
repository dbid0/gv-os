/**
 * The payout engine.
 *
 * This is the arithmetic the Master Finance Sheet performs in its `💰 New Deals`
 * tab, reconstructed from the live formulas and expressed as pure functions so
 * it can be tested to the cent and reused everywhere. It stores nothing and
 * reads no database; it takes plain numbers in and returns plain numbers out.
 *
 * The chain, per deal:
 *
 *     Cash collected  = sum of the deal's payment events (refunds are negative)
 *     Processor fee   = sum of per-payment fees (override, else by method)
 *     Net cash        = cash collected − processor fee
 *     Balance due AR  = max(contract value − cash collected, 0)
 *     Daniel payout   = net cash × Daniel's share
 *     Gus payout      = net cash − Daniel payout        (a residual, not a
 *                                                         second multiplication)
 *
 * Gus is deliberately the residual: `allocatePair` gives Daniel the floor of his
 * exact share and Gus the rest, so the two ALWAYS sum to exactly net cash. No
 * cent can be lost or invented between the partners, on a payment or a refund.
 */

import { type Cents, cents, sum, subtract, ZERO } from "@/lib/money";
import { allocatePair, percentToBps, TOTAL_BPS, type Bps } from "@/lib/splits";
import { processorFee } from "@/lib/accounting/fees";

/** One payment against a deal. A refund is the same shape with a negative amount. */
export interface PaymentInput {
  /** Signed cents. Positive is money in, negative is a refund. */
  amountCents: Cents;
  /** fanbasis | wire | ach | zelle */
  processor: string;
  /**
   * A manual fee for this payment, overriding the by-method calculation.
   * Use `null`/omit to compute the fee from the processor.
   */
  feeOverrideCents?: Cents | null;
}

export interface DealPayoutInput {
  /** What was agreed, in cents. The revenue figure for AR. */
  contractValueCents: Cents;
  /** The payment events for this deal. */
  payments: readonly PaymentInput[];
  /** Daniel's share, in basis points. Gus receives the remainder. */
  danielBps: Bps;
}

export interface DealPayout {
  cashCollectedCents: Cents;
  processorFeeCents: Cents;
  netCashCents: Cents;
  /** Accounts receivable: what is still owed. Never negative. */
  balanceDueCents: Cents;
  danielPayoutCents: Cents;
  gusPayoutCents: Cents;
}

/** The fee for a single payment: an explicit override, else computed by method. */
function feeForPayment(payment: PaymentInput): Cents {
  if (payment.feeOverrideCents != null) {
    return payment.feeOverrideCents;
  }
  return processorFee(payment.amountCents, payment.processor);
}

/** Clamp a signed amount up to zero. AR is never negative — an overpayment is
 *  not a debt owed the other way, it is just a zero balance. */
function atLeastZero(amount: Cents): Cents {
  return amount < 0 ? ZERO : amount;
}

/**
 * Computes a deal's full payout position from its payments and split.
 *
 * Pure: same inputs always give the same output, with no rounding drift, because
 * every step is integer-cent arithmetic and the partner split is a largest-
 * remainder allocation rather than two independent multiplications.
 */
export function computeDealPayout(input: DealPayoutInput): DealPayout {
  if (input.danielBps < 0 || input.danielBps > TOTAL_BPS) {
    throw new RangeError(
      `Daniel's share must be between 0 and ${TOTAL_BPS} bps, received ${input.danielBps}.`,
    );
  }

  const cashCollectedCents = sum(input.payments.map((p) => p.amountCents));
  const processorFeeCents = sum(input.payments.map(feeForPayment));
  const netCashCents = subtract(cashCollectedCents, processorFeeCents);
  const balanceDueCents = atLeastZero(
    subtract(input.contractValueCents, cashCollectedCents),
  );

  const { first: danielPayoutCents, second: gusPayoutCents } = allocatePair(
    netCashCents,
    input.danielBps,
  );

  return {
    cashCollectedCents,
    processorFeeCents,
    netCashCents,
    balanceDueCents,
    danielPayoutCents,
    gusPayoutCents,
  };
}

/**
 * Resolves Daniel's share to basis points, following the sheet's rule exactly:
 *
 *   - "Client Handoff" deals are always 50/50.
 *   - A blank percentage defaults to 50/50 (the standing partnership split).
 *   - Otherwise the entered percentage is used, rejecting anything that is not a
 *     whole basis point.
 *
 * This is the ONLY place the 50/50 default lives, so the rule is stated once.
 */
export function resolveDanielBps(
  dealType: string,
  enteredPercent?: number | null,
): Bps {
  const DEFAULT_BPS = TOTAL_BPS / 2; // 5000 = 50%

  if (dealType.trim().toLowerCase() === "client handoff") {
    return DEFAULT_BPS;
  }
  if (enteredPercent == null) {
    return DEFAULT_BPS;
  }
  return percentToBps(enteredPercent);
}

/** Re-export for callers assembling inputs. */
export { cents };
