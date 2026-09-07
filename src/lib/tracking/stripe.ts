/**
 * STRIPE → TRACKING ROWS.
 *
 * The processor's own record of the money. This exists because a hand-kept
 * payment log and the processor were found to disagree materially: the log
 * caught the large one-off closes and missed most low-ticket RECURRING
 * charges, because nobody hand-logs a subscription renewal. A human log will
 * always lose that race, so it stops being the source of truth for cash.
 *
 * Three things about Stripe's shape that a naive reader gets wrong:
 *
 *   1. `amount` is ALREADY in the smallest currency unit. Multiplying by 100
 *      to "convert to cents" inflates every figure a hundredfold.
 *   2. A refunded charge KEEPS `status: "succeeded"`. Stripe records the
 *      refund beside the charge, it does not restate it. Reading status alone
 *      counts refunded money as collected — the exact failure that makes a
 *      month look better than it was.
 *   3. `amount` is denominated in the charge's OWN currency. Summing a EUR
 *      charge into a dollar total is a silent category error, so foreign
 *      charges are excluded and reported rather than quietly added.
 *
 * A charge and its refund are emitted as SEPARATE rows: the charge for what
 * arrived, the refund for what went back. That keeps a partial refund exact
 * (a $5,000 charge refunded $997 nets $4,003) where collapsing it onto one
 * row cannot — `totalPayments` treats a row as wholly one thing or the other.
 *
 * Pure: no network, no clock, no database.
 */

import type { TrackingRow } from "@/lib/tracking/parse";

/** The fields of a Stripe charge this adapter reads. */
export interface StripeCharge {
  id: string;
  /** Smallest currency unit. For USD this is already cents. */
  amount: number;
  amount_refunded?: number | null;
  currency?: string | null;
  /** Unix seconds. */
  created: number;
  status?: string | null;
  description?: string | null;
  receipt_email?: string | null;
  billing_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
}

export interface StripeNormalizeOptions {
  /** Only charges in this currency are counted. Lowercase ISO-4217. */
  currency?: string;
}

export interface StripeNormalizeResult {
  rows: TrackingRow[];
  /** Charges skipped for being in another currency, so it is never silent. */
  skippedForeign: { id: string; currency: string; amount: number }[];
}

/** Best email Stripe knows for a charge. */
function chargeEmail(charge: StripeCharge): string | null {
  const email = charge.billing_details?.email ?? charge.receipt_email ?? null;
  const trimmed = email?.trim() ?? "";
  return trimmed === "" ? null : trimmed.toLowerCase();
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Turn Stripe charges into payment rows.
 *
 * Ordering follows the input, and `rowIndex` counts emitted rows so a figure
 * on the dashboard can be traced back to the row that produced it.
 */
export function normalizeStripeCharges(
  charges: StripeCharge[],
  options: StripeNormalizeOptions = {},
): StripeNormalizeResult {
  const want = (options.currency ?? "usd").toLowerCase();
  const rows: TrackingRow[] = [];
  const skippedForeign: StripeNormalizeResult["skippedForeign"] = [];

  for (const charge of charges) {
    const currency = (charge.currency ?? want).toLowerCase();
    if (currency !== want) {
      skippedForeign.push({
        id: charge.id,
        currency,
        amount: charge.amount,
      });
      continue;
    }

    const occurredAt = Number.isFinite(charge.created)
      ? new Date(charge.created * 1000)
      : null;
    const email = chargeEmail(charge);
    const name = text(charge.billing_details?.name);
    const phone = text(charge.billing_details?.phone);
    const status = text(charge.status) ?? "succeeded";

    // The charge itself: what arrived.
    rows.push({
      tab: "payments",
      rowIndex: rows.length + 1,
      occurredAt,
      email,
      name,
      phone,
      rep: null,
      status,
      outcome: null,
      cashCents: charge.amount,
      revenueCents: null,
      recordingUrl: null,
      notes: text(charge.description),
      payload: {
        stripe_charge_id: charge.id,
        processor: "Stripe",
        currency,
        kind: "charge",
        ...(charge.metadata ?? {}),
      },
    });

    // The refund, if any: what went back. Its own row so a PARTIAL refund
    // subtracts only what was actually returned.
    const refunded = charge.amount_refunded ?? 0;
    if (refunded > 0) {
      rows.push({
        tab: "payments",
        rowIndex: rows.length + 1,
        occurredAt,
        email,
        name,
        phone,
        rep: null,
        status: "refunded",
        outcome: null,
        cashCents: refunded,
        revenueCents: null,
        recordingUrl: null,
        notes: `Refund of ${charge.id}`,
        payload: {
          stripe_charge_id: charge.id,
          processor: "Stripe",
          currency,
          kind: "refund",
        },
      });
    }
  }

  return { rows, skippedForeign };
}
