/**
 * Processor fees.
 *
 * A payment does not arrive whole: the processor takes a cut before the cash
 * lands. The sheet models this per payment method, and so do we. The rule,
 * reconstructed from the live Master Finance Sheet and verified against real
 * payouts:
 *
 *   - Fanbasis charges 2.9% PLUS a flat $0.29 per transaction.
 *   - Wire, ACH and Zelle are bank rails: no processor fee.
 *
 * The fee is charged PER TRANSACTION, not per deal, because the flat 29¢ is a
 * per-charge cost. A deal collected in three Fanbasis payments pays the 29¢
 * three times. Computing it per event is both more correct and what makes a
 * payment plan reconcile.
 *
 * Unknown processors THROW rather than defaulting to zero. A silent zero on an
 * unrecognised rail would quietly understate fees and overstate net cash — a
 * money error that hides. Better to fail loudly and force either a code change
 * or an explicit manual override at the call site.
 */

import { type Cents, cents, add, applyBps, ZERO, MoneyError } from "@/lib/money";

/** 2.9%, in basis points. */
export const FANBASIS_BPS = 290;
/** $0.29 flat, per transaction, in cents. */
export const FANBASIS_FLAT_CENTS = cents(29);

/** Processors that settle with no fee. */
const FREE_RAILS = new Set(["wire", "ach", "zelle"]);

function normalize(processor: string): string {
  return processor.trim().toLowerCase();
}

/**
 * The processor fee for ONE payment, in cents. Always non-negative.
 *
 * @param amountCents the gross amount of a single transaction
 * @param processor   fanbasis | wire | ach | zelle
 */
export function processorFee(amountCents: Cents, processor: string): Cents {
  const rail = normalize(processor);

  if (rail === "fanbasis") {
    // Percentage part rounds half away from zero (money.applyBps), then the
    // flat per-transaction charge is added on top.
    return add(applyBps(amountCents, FANBASIS_BPS), FANBASIS_FLAT_CENTS);
  }

  if (FREE_RAILS.has(rail)) {
    return ZERO;
  }

  throw new MoneyError(
    `Unknown processor "${processor}". Add its fee rule to fees.ts or supply an ` +
      `explicit fee override; defaulting to zero would silently understate fees.`,
  );
}

/** True when the processor is one this module knows how to charge. */
export function isKnownProcessor(processor: string): boolean {
  const rail = normalize(processor);
  return rail === "fanbasis" || FREE_RAILS.has(rail);
}
