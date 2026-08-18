/**
 * From stored rows to a computed payout.
 *
 * The payout engine works on plain numbers so it can be tested to the cent. This
 * thin adapter is the one place that knows how a `deal` row and its
 * `ledger.money_events` map onto the engine's inputs — nothing else in the app
 * reaches into event shapes to do money math.
 *
 * Two rules keep it honest and lean:
 *
 *   1. FEES ARE COMPUTED, NOT STORED. The ledger records the cash the customer
 *      actually moved (payments and refunds); the processor's cut is always
 *      derived from `fees.ts`, so there is one source of fee truth and no stored
 *      fee row that can drift from the rule. A refund carries no fee.
 *   2. THE SPLIT COMES FROM THE DEAL. `daniel_bps` is used when set — that is how
 *      a historical non-50/50 deal stays faithful — and falls back to the
 *      standing 50/50 rule when null, which is every new deal.
 *
 * Only cash events feed the calculation. A `payout` or `adjustment` event is not
 * money the partners collected, so it is ignored here by design.
 */

import { cents } from "@/lib/money";
import { TOTAL_BPS } from "@/lib/splits";
import {
  computeDealPayout,
  type DealPayout,
  type PaymentInput,
} from "@/lib/accounting/payout";

/** The default split when a deal records none: the standing 50/50. */
const DEFAULT_DANIEL_BPS = TOTAL_BPS / 2;

/** Event types that represent cash moving to or from the customer. */
const PAYMENT_TYPE = "payment_received";
const REFUND_TYPE = "refund";

/** The fields of a `deals` row this needs. Real rows satisfy it structurally. */
export interface DealRow {
  contractValueCents: number;
  danielBps: number | null;
}

/** The fields of a `money_events` row this needs. */
export interface MoneyEventRow {
  eventType: string;
  amountCents: number;
  processor: string | null;
}

/**
 * Computes a deal's payout position from its row and its ledger events.
 *
 * Payments incur a processor fee derived from their method; refunds reduce cash
 * and carry no fee; every other event type is ignored. The result is exactly
 * what `computeDealPayout` would return, so the ledger and any live preview
 * agree by construction.
 */
export function dealPayoutFromRows(
  deal: DealRow,
  events: readonly MoneyEventRow[],
): DealPayout {
  const payments: PaymentInput[] = [];

  for (const event of events) {
    if (event.eventType === PAYMENT_TYPE) {
      payments.push({
        amountCents: cents(event.amountCents),
        processor: event.processor ?? "",
      });
    } else if (event.eventType === REFUND_TYPE) {
      payments.push({
        amountCents: cents(event.amountCents),
        processor: event.processor ?? "",
        // A refund returns cash; the processor does not charge us again for it.
        feeOverrideCents: cents(0),
      });
    }
    // payout, processor_fee, adjustment, … are not customer cash: ignored here.
  }

  return computeDealPayout({
    contractValueCents: cents(deal.contractValueCents),
    payments,
    danielBps: deal.danielBps ?? DEFAULT_DANIEL_BPS,
  });
}
