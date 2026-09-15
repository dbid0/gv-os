import { describe, expect, it } from "vitest";

import {
  dollarsToCents,
  normalizeCommas,
  normalizeGeneric,
  normalizePayment,
  normalizeStripe,
  normalizeWhop,
} from "@/lib/payments/normalize";

describe("dollarsToCents", () => {
  it("converts dollars with float noise to exact cents", () => {
    expect(dollarsToCents(49)).toBe(4900);
    expect(dollarsToCents(58.29)).toBe(5829);
    expect(dollarsToCents(1941.71)).toBe(194171);
    expect(dollarsToCents(-12.5)).toBe(-1250);
  });
});

describe("normalizeStripe", () => {
  const charge = {
    id: "evt_1AbCdE",
    type: "charge.succeeded",
    created: 1787280000,
    data: {
      object: {
        amount: 200000,
        amount_captured: 200000,
        currency: "usd",
        billing_details: { email: "buyer@example.com" },
      },
    },
  };

  it("keeps Stripe's integer cents as-is", () => {
    const out = normalizeStripe(charge);
    expect(out).toMatchObject({
      externalId: "evt_1AbCdE",
      kind: "charge",
      amountCents: 200000,
      currency: "usd",
      email: "buyer@example.com",
      label: "charge.succeeded",
    });
    expect(out?.occurredAt).toBe(new Date(1787280000 * 1000).toISOString());
  });

  it("captures refunds as negative amounts", () => {
    const out = normalizeStripe({
      ...charge,
      type: "charge.refunded",
      data: { object: { amount: 5000, currency: "usd" } },
    });
    expect(out?.kind).toBe("refund");
    expect(out?.amountCents).toBe(-5000);
  });

  it("rejects a payload with no id (no id, no idempotency)", () => {
    expect(normalizeStripe({ type: "charge.succeeded" })).toBeNull();
  });

  it("marks non-charge types unknown but still captures them", () => {
    const out = normalizeStripe({ id: "evt_x", type: "invoice.paid", data: {} });
    expect(out?.kind).toBe("unknown");
    expect(out?.amountCents).toBe(0);
  });

  it("captures a declined charge as kind 'failed' with the ATTEMPTED amount", () => {
    const out = normalizeStripe({
      id: "evt_failed",
      type: "charge.failed",
      created: 1787280000,
      data: {
        object: {
          amount: 199700,
          // A declined charge captured nothing — the recoverable figure is the
          // amount it TRIED to charge, never the zero it captured.
          amount_captured: 0,
          paid: false,
          currency: "usd",
          failure_code: "card_declined",
          failure_message: "Your card was declined.",
          customer: "cus_123",
          billing_details: { email: "declined@example.com" },
        },
      },
    });
    expect(out).toMatchObject({
      externalId: "evt_failed",
      kind: "failed",
      amountCents: 199700,
      email: "declined@example.com",
      failureCode: "card_declined",
      failureMessage: "Your card was declined.",
      customerRef: "cus_123",
    });
    // A failed attempt stays POSITIVE — recoverable, never a negative refund.
    expect(out!.amountCents).toBeGreaterThan(0);
  });

  it("reads failure detail off a PaymentIntent's last_payment_error", () => {
    const out = normalizeStripe({
      id: "evt_pi_failed",
      type: "payment_intent.payment_failed",
      created: 1787280000,
      data: {
        object: {
          amount: 50000,
          currency: "usd",
          customer: "cus_x",
          receipt_email: "pi@example.com",
          last_payment_error: {
            code: "card_declined",
            decline_code: "insufficient_funds",
            message: "Insufficient funds.",
          },
        },
      },
    });
    expect(out).toMatchObject({
      kind: "failed",
      amountCents: 50000,
      email: "pi@example.com",
      failureCode: "insufficient_funds",
      failureMessage: "Insufficient funds.",
      customerRef: "cus_x",
    });
  });

  it("falls back to last_payment_error.code when no decline code exists", () => {
    const out = normalizeStripe({
      id: "evt_pi_expired",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          amount: 25000,
          last_payment_error: { code: "expired_card", message: "Card expired." },
        },
      },
    });
    expect(out).toMatchObject({
      kind: "failed",
      amountCents: 25000,
      failureCode: "expired_card",
      failureMessage: "Card expired.",
    });
  });

  it("treats an unpaid charge carrying a failure code as failed, whatever its type", () => {
    const out = normalizeStripe({
      id: "evt_unpaid",
      type: "charge.updated",
      data: {
        object: {
          // No attempted amount on the object: the captured figure stands in.
          amount_captured: 12345,
          paid: false,
          failure_code: "processing_error",
        },
      },
    });
    expect(out).toMatchObject({
      kind: "failed",
      amountCents: 12345,
      failureCode: "processing_error",
      failureMessage: null,
    });
  });

  it("captures a failed attempt with no amount fields at zero, never negative", () => {
    const out = normalizeStripe({
      id: "evt_failed_blank",
      type: "charge.failed",
      data: { object: { paid: false } },
    });
    expect(out).toMatchObject({ kind: "failed", amountCents: 0, failureCode: null });
  });

  it("an unpaid charge WITHOUT a failure code is not a failed attempt", () => {
    const out = normalizeStripe({
      id: "evt_pending",
      type: "charge.pending",
      data: { object: { amount: 7500, paid: false } },
    });
    expect(out).toMatchObject({ kind: "charge", amountCents: 7500, failureCode: null });
  });

  it("labels a payload with no event type as unknown", () => {
    const out = normalizeStripe({
      id: "evt_untyped",
      data: { object: { amount: 100 } },
    });
    expect(out).toMatchObject({ kind: "unknown", label: "unknown", amountCents: 100 });
  });
});

describe("normalizeCommas (defensive probing; formerly Fanbasis)", () => {
  it("finds dollars + email across the known field spellings", () => {
    const out = normalizeCommas({
      transaction_id: "fb_123",
      total: 1400,
      buyer_email: "Buyer@Client.com",
      type: "New Sale",
      created_at: "2026-08-03T14:00:00Z",
    });
    expect(out).toMatchObject({
      externalId: "fb_123",
      kind: "charge",
      amountCents: 140000,
      email: "Buyer@Client.com",
    });
  });

  it("captures refunds negative and unknown-amount payloads as unknown", () => {
    expect(
      normalizeCommas({ id: "fb_9", amount: 49, type: "Refund Issued" }),
    ).toMatchObject({ kind: "refund", amountCents: -4900 });
    expect(normalizeCommas({ id: "fb_10" })).toMatchObject({
      kind: "unknown",
      amountCents: 0,
    });
    expect(normalizeCommas({ type: "New Sale" })).toBeNull();
  });

  it("parses numeric strings as dollars and ignores blank or non-numeric ones", () => {
    expect(normalizeCommas({ id: "fb_11", amount: " 1400.50 " })).toMatchObject({
      kind: "charge",
      amountCents: 140050,
    });
    // A blank string falls through to the next spelling rather than reading as $0.
    expect(normalizeCommas({ id: "fb_12", amount: "   ", total: 25 })).toMatchObject({
      kind: "charge",
      amountCents: 2500,
    });
    expect(normalizeCommas({ id: "fb_13", amount: "n/a" })).toMatchObject({
      kind: "unknown",
      amountCents: 0,
    });
  });
});

describe("normalizeWhop", () => {
  it("reads the nested data object and converts dollars", () => {
    const out = normalizeWhop({
      action: "payment.succeeded",
      data: {
        id: "pay_wh1",
        final_amount: 997,
        user_email: "member@example.com",
        created_at: "2026-08-20T10:00:00Z",
      },
    });
    expect(out).toMatchObject({
      externalId: "pay_wh1",
      kind: "charge",
      amountCents: 99700,
    });
  });

  it("handles refund actions and missing ids", () => {
    expect(
      normalizeWhop({ action: "refund.created", data: { id: "r1", final_amount: 49 } }),
    ).toMatchObject({ kind: "refund", amountCents: -4900 });
    expect(normalizeWhop({ action: "payment.succeeded", data: {} })).toBeNull();
  });

  it("falls back to subtotal, then usd_amount, for the dollar figure", () => {
    expect(
      normalizeWhop({
        action: "payment.succeeded",
        data: { id: "w_2", subtotal: 49.99 },
      }),
    ).toMatchObject({ kind: "charge", amountCents: 4999 });
    expect(
      normalizeWhop({
        action: "payment.succeeded",
        data: { id: "w_3", usd_amount: 120.01 },
      }),
    ).toMatchObject({ kind: "charge", amountCents: 12001 });
  });

  it("captures a payment with no amount as unknown at zero", () => {
    expect(normalizeWhop({ data: { id: "w_4" } })).toMatchObject({
      externalId: "w_4",
      kind: "unknown",
      amountCents: 0,
      label: "whop payment",
    });
  });
});

describe("normalizeGeneric + dispatch", () => {
  it("captures anything with an id as unknown", () => {
    const out = normalizeGeneric({ event_id: "x_1", amount: 25 });
    expect(out).toMatchObject({
      externalId: "x_1",
      kind: "unknown",
      amountCents: 2500,
    });
    expect(normalizeGeneric({})).toBeNull();
  });

  it("reads a nested data.amount and zeroes a payload with no amount", () => {
    expect(normalizeGeneric({ data: { id: "g_1", amount: 12.34 } })).toMatchObject({
      externalId: "g_1",
      amountCents: 1234,
    });
    expect(normalizeGeneric({ id: "g_2" })).toMatchObject({
      externalId: "g_2",
      kind: "unknown",
      amountCents: 0,
      label: "payment",
    });
  });

  it("dispatches by provider and falls back to generic", () => {
    expect(
      normalizePayment("stripe", { id: "evt_1", type: "charge.succeeded", data: {} }),
    ).toMatchObject({ externalId: "evt_1" });
    expect(
      normalizePayment("whop", { data: { id: "w_1", final_amount: 10 } }),
    ).toMatchObject({ externalId: "w_1" });
    // Commas is canonical AND the retired "fanbasis" string both route to the
    // same normalizer — a real charge, not the generic unknown fallback.
    expect(normalizePayment("commas", { id: "c_1", amount: 10 })).toMatchObject({
      kind: "charge",
      amountCents: 1000,
    });
    expect(normalizePayment("fanbasis", { id: "fb_1", amount: 10 })).toMatchObject({
      kind: "charge",
      amountCents: 1000,
    });
    // An unlisted provider takes the generic probe: captured, but never
    // classified as a charge.
    expect(
      normalizePayment("other-processor", { id: "o_1", amount: 10, type: "sale" }),
    ).toMatchObject({
      externalId: "o_1",
      kind: "unknown",
      amountCents: 1000,
      label: "sale",
    });
  });
});
