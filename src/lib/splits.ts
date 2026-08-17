/**
 * Splitting money between parties.
 *
 * The whole problem: $1,358.98 halves cleanly into $679.49 twice, but $1,358.99
 * does not. Something has to receive the odd cent, and whatever chooses must be
 * deterministic, must never invent or destroy a cent, and must behave the same
 * on a refund as on a payment.
 *
 * This uses the LARGEST REMAINDER method:
 *   1. Give every party the floor of its exact share.
 *   2. Hand the leftover cents out one at a time, largest fractional remainder
 *      first, ties broken by position so the result is reproducible.
 *
 * The invariant, asserted by property tests over thousands of random inputs:
 *
 *     sum(allocate(total, weights)) === total,   always, exactly.
 *
 * Naive `Math.round(total * pct)` per party breaks this: round two 50% shares of
 * an odd amount and you conjure a cent from nothing.
 */

import { cents, type Cents, MoneyError } from "@/lib/money";

/** Basis points. 10000 = 100%, 5000 = 50%, 2500 = 25%. */
export type Bps = number;

export const TOTAL_BPS = 10_000;

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

function assertWeights(weights: readonly Bps[]): void {
  if (weights.length === 0) {
    throw new SplitError("at least one weight is required");
  }

  for (const weight of weights) {
    if (!Number.isInteger(weight)) {
      throw new SplitError(`weights must be whole basis points, received ${weight}`);
    }
    if (weight < 0) {
      throw new SplitError(`weights cannot be negative, received ${weight}`);
    }
  }

  const total = weights.reduce((running, weight) => running + weight, 0);
  if (total !== TOTAL_BPS) {
    throw new SplitError(
      `weights must sum to ${TOTAL_BPS} basis points (100%), received ${total}. ` +
        `A split that does not sum to 100% would lose or invent money.`,
    );
  }
}

/**
 * Splits `total` across `weights`, returning one amount per weight.
 *
 * Handles negative totals (refunds and payouts) by allocating on the magnitude
 * and re-applying the sign, so a refund is split exactly like the payment it
 * reverses. That symmetry matters: it means reversing a transaction restores
 * every party to where they started, with no residue.
 */
export function allocate(total: Cents, weights: readonly Bps[]): Cents[] {
  assertWeights(weights);

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  // Exact share = magnitude * weight / TOTAL_BPS, kept in integer arithmetic.
  const floors: number[] = [];
  const remainders: { index: number; remainder: number }[] = [];
  let distributed = 0;

  weights.forEach((weight, index) => {
    const numerator = magnitude * weight;
    const share = Math.floor(numerator / TOTAL_BPS);
    floors.push(share);
    distributed += share;
    remainders.push({ index, remainder: numerator % TOTAL_BPS });
  });

  let leftover = magnitude - distributed;

  // Largest remainder first; ties go to the earlier position so the same input
  // always produces the same output.
  remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; leftover > 0; i += 1, leftover -= 1) {
    floors[remainders[i % remainders.length].index] += 1;
  }

  return floors.map((share) => cents(sign * share));
}

/** Convenience for the common two-party case. */
export function allocatePair(
  total: Cents,
  firstBps: Bps,
): { first: Cents; second: Cents } {
  const [first, second] = allocate(total, [firstBps, TOTAL_BPS - firstBps]);
  return { first, second };
}

/**
 * Converts a percentage to basis points, rejecting anything that would not be a
 * whole basis point (50.005% is not representable and must not be silently
 * rounded into a split).
 */
export function percentToBps(percent: number): Bps {
  const bps = percent * 100;
  if (!Number.isInteger(bps)) {
    throw new MoneyError(
      `${percent}% is not a whole number of basis points. Use at most two decimal places.`,
    );
  }
  return bps;
}
