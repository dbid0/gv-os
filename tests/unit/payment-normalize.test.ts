import { describe, expect, it } from "vitest";

import {
  dollarsToCents,
  normalizeFanbasis,
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
});

describe("normalizeFanbasis (defensive probing)", () => {
  it("finds dollars + email across the known field spellings", () => {
    const out = normalizeFanbasis({
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
      normalizeFanbasis({ id: "fb_9", amount: 49, type: "Refund Issued" }),
    ).toMatchObject({ kind: "refund", amountCents: -4900 });
    expect(normalizeFanbasis({ id: "fb_10" })).toMatchObject({
      kind: "unknown",
      amountCents: 0,
    });
    expect(normalizeFanbasis({ type: "New Sale" })).toBeNull();
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

  it("dispatches by provider and falls back to generic", () => {
    expect(
      normalizePayment("stripe", { id: "evt_1", type: "charge.succeeded", data: {} }),
    ).toMatchObject({ externalId: "evt_1" });
    expect(normalizePayment("fanbasis", { id: "fb_1", amount: 10 })).toMatchObject({
      amountCents: 1000,
    });
    expect(
      normalizePayment("whop", { data: { id: "w_1", final_amount: 10 } }),
    ).toMatchObject({ externalId: "w_1" });
    expect(normalizePayment("commas", { id: "c_1", amount: 10 })).toMatchObject({
      kind: "unknown",
      amountCents: 1000,
    });
  });
});
