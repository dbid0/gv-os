import { EMPTY_ALIASES, resolveEmail, type AliasMap } from "@/lib/tracking/aliases";

/**
 * THE CASH MIX — whose money is this month made of?
 *
 * One number ("cash collected") hides the difference between a month of new
 * buyers and a month of renewals. For an offer with a low-ticket recurring
 * front end, the split IS the retention story:
 *
 *   • NEW — a payer's first-ever collected payment.
 *   • RECURRING, SAME MONTH — more money from that payer inside the calendar
 *     month they first paid (a same-month upsell or second instalment).
 *   • AFTER THE 1st MONTH — money from payers whose first payment was in an
 *     earlier calendar month. This bucket is retention made visible.
 *   • UNPLACEABLE — collected money with no payer identity or no date; shown,
 *     never guessed into a bucket.
 *
 * The classifier takes the FULL payment history and a window: first-payment
 * lookups need every month, while the mix reported is only the window's.
 * Refunds and failed charges never enter any bucket (classifyPayment).
 *
 * Pure: no clock, no database.
 */

import { classifyPayment } from "@/lib/tracking/refunds";

export interface MixPayment {
  /** Payer identity — email first, phone key as fallback. */
  email: string | null;
  phone?: string | null;
  cashCents: number | null;
  status: string | null;
  occurredAt: Date | null;
}

export interface CashMix {
  newCents: number;
  recurringSameMonthCents: number;
  afterFirstMonthCents: number;
  unplaceableCents: number;
  /** Distinct payers whose FIRST payment falls inside the window. */
  newPayers: number;
  /** Distinct earlier-month payers who paid again inside the window. */
  returningPayers: number;
}

/**
 * A payer's identity key — the one the cash mix counts payers by. Exported so
 * any per-payer view (the students board) groups people exactly as the mix
 * does, and a person can never be one payer here and two there.
 */
export const payerKeyOf = (p: MixPayment, aliases: AliasMap): string | null =>
  keyOf(p, aliases);

const keyOf = (p: MixPayment, aliases: AliasMap): string | null => {
  // Identity resolves through the alias map FIRST — the same person paying
  // from two inboxes must land on one payer key or "new" over-counts.
  const email = resolveEmail(p.email ?? null, aliases);
  if (email) return `e:${email}`;
  const digits = (p.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  return null;
};

const monthOf = (d: Date): string => d.toISOString().slice(0, 7);

export function cashMix(
  history: MixPayment[],
  windowFrom: Date,
  windowTo: Date,
  aliases: AliasMap = EMPTY_ALIASES,
): CashMix {
  // Collected money only — a refund or a declined card is not a mix.
  const collected = history.filter(
    (p) =>
      classifyPayment({ cashCents: p.cashCents, status: p.status }) === "collected" &&
      (p.cashCents ?? 0) > 0,
  );

  // Each payer's first-ever collected payment, from the FULL history.
  const firstAt = new Map<string, number>();
  for (const p of collected) {
    const key = keyOf(p, aliases);
    if (!key || !p.occurredAt) continue;
    const t = p.occurredAt.getTime();
    const prev = firstAt.get(key);
    if (prev === undefined || t < prev) firstAt.set(key, t);
  }

  const mix: CashMix = {
    newCents: 0,
    recurringSameMonthCents: 0,
    afterFirstMonthCents: 0,
    unplaceableCents: 0,
    newPayers: 0,
    returningPayers: 0,
  };
  const newPayerKeys = new Set<string>();
  const returningKeys = new Set<string>();

  for (const p of collected) {
    if (!p.occurredAt) continue;
    const t = p.occurredAt.getTime();
    if (t < windowFrom.getTime() || t > windowTo.getTime()) continue;
    const cents = p.cashCents ?? 0;
    const key = keyOf(p, aliases);
    if (!key) {
      mix.unplaceableCents += cents;
      continue;
    }
    const first = firstAt.get(key)!;
    if (t === first) {
      mix.newCents += cents;
      newPayerKeys.add(key);
    } else if (monthOf(new Date(t)) === monthOf(new Date(first))) {
      // Their first month, but not their first payment.
      mix.recurringSameMonthCents += cents;
      newPayerKeys.add(key);
    } else {
      mix.afterFirstMonthCents += cents;
      returningKeys.add(key);
    }
  }

  mix.newPayers = newPayerKeys.size;
  mix.returningPayers = returningKeys.size;
  return mix;
}

/**
 * The window's FULL collected cash — every bucket the mix split it into, the
 * unplaceable remainder included. This is the same set the mix sums, so wiring
 * a "cash collected" headline to this makes the headline equal the mix beneath
 * it by construction (the bar shows the placeable split; the headline is the
 * whole window). Never a false zero when the mix is non-zero.
 */
export function mixTotalCents(mix: CashMix): number {
  return (
    mix.newCents +
    mix.recurringSameMonthCents +
    mix.afterFirstMonthCents +
    mix.unplaceableCents
  );
}

/**
 * Collected cash inside [from, to] from a payment history — the mix's own
 * total before it is split into buckets. Identical to summing the four buckets
 * of `cashMix(history, from, to)`; kept separate for windows where only the
 * total is needed (a previous period's comparison figure) without paying to
 * classify payers. Refunds and failed charges never count (classifyPayment).
 */
export function collectedInWindow(
  history: MixPayment[],
  windowFrom: Date,
  windowTo: Date,
): number {
  let sum = 0;
  for (const p of history) {
    if (!p.occurredAt) continue;
    const t = p.occurredAt.getTime();
    if (t < windowFrom.getTime() || t > windowTo.getTime()) continue;
    if (classifyPayment({ cashCents: p.cashCents, status: p.status }) !== "collected") {
      continue;
    }
    const cents = p.cashCents ?? 0;
    if (cents <= 0) continue;
    sum += cents;
  }
  return sum;
}
