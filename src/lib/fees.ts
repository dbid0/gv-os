import { type Cents, ZERO, applyBps, cents } from "@/lib/money";

/**
 * The processor fee taken out of a cash collection.
 *
 * A percentage (in basis points) plus a flat per-transaction charge — the
 * Fanbasis shape (2.9% + $0.30) the finance sheet already models. The fee can
 * never exceed the cash it is taken from, and never goes negative. Money math,
 * so it ships fully covered.
 */
export function processorFee(
  cash: Cents,
  feeBps: number | null,
  feeFlatCents: number | null,
): Cents {
  if (cash <= 0) return ZERO;
  const percentPart = feeBps ? applyBps(cash, feeBps) : ZERO;
  const flatPart = feeFlatCents ?? 0;
  const fee = percentPart + flatPart;
  if (fee <= 0) return ZERO;
  return cents(Math.min(fee, cash));
}
