import { describe, expect, it } from "vitest";

import { totalPayments } from "@/lib/tracking/refunds";
import { normalizeStripeCharges, type StripeCharge } from "@/lib/tracking/stripe";

function charge(over: Partial<StripeCharge> = {}): StripeCharge {
  return {
    id: "ch_1",
    amount: 4900,
    currency: "usd",
    created: 1_756_000_000,
    status: "succeeded",
    ...over,
  };
}

describe("normalizeStripeCharges", () => {
  it("reads Stripe's amount as cents ALREADY, never multiplying", () => {
    // $49.00 arrives as 4900. Treating it as dollars and scaling gives $4,900.
    const { rows } = normalizeStripeCharges([charge({ amount: 4900 })]);
    expect(rows[0].cashCents).toBe(4900);
  });

  it("emits a refund as its own row, because a refunded charge still says succeeded", () => {
    // A real refund observed in production: Stripe left status "succeeded"
    // and recorded amount_refunded beside it. Reading status alone counts it
    // as collected.
    const { rows } = normalizeStripeCharges([
      charge({
        id: "ch_r",
        amount: 99700,
        amount_refunded: 99700,
        status: "succeeded",
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("refunded");
    expect(rows[1].cashCents).toBe(99700);
    expect(totalPayments(rows).netCents).toBe(0);
  });

  it("keeps a PARTIAL refund exact", () => {
    // $5,000 charged, $997 back = $4,003 net. Collapsing both onto one row
    // cannot express this: the row would be wholly collected or wholly refunded.
    const { rows } = normalizeStripeCharges([
      charge({ amount: 500_000, amount_refunded: 99_700 }),
    ]);
    const totals = totalPayments(rows);
    expect(totals.grossCents).toBe(500_000);
    expect(totals.refundedCents).toBe(99_700);
    expect(totals.netCents).toBe(400_300);
  });

  it("does not invent a refund row when nothing was returned", () => {
    const { rows } = normalizeStripeCharges([charge({ amount_refunded: 0 })]);
    expect(rows).toHaveLength(1);
  });

  it("counts a failed charge in neither total", () => {
    const { rows } = normalizeStripeCharges([charge({ status: "failed" })]);
    const totals = totalPayments(rows);
    expect(totals.grossCents).toBe(0);
    expect(totals.failedCents).toBe(4900);
  });

  it("EXCLUDES a foreign-currency charge and reports it rather than summing it", () => {
    // 4900 EUR-cents is not 4900 USD-cents. Adding them is a silent error.
    const { rows, skippedForeign } = normalizeStripeCharges([
      charge({ id: "ch_usd" }),
      charge({ id: "ch_eur", currency: "eur" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(skippedForeign).toEqual([{ id: "ch_eur", currency: "eur", amount: 4900 }]);
  });

  it("converts Stripe's unix SECONDS, not milliseconds", () => {
    const { rows } = normalizeStripeCharges([charge({ created: 1_756_000_000 })]);
    expect(rows[0].occurredAt?.toISOString()).toBe("2025-08-24T01:46:40.000Z");
  });

  it("takes the billing email, falling back to the receipt email, lowercased", () => {
    const withBilling = normalizeStripeCharges([
      charge({
        billing_details: { email: "Kaden@Grid.com" },
        receipt_email: "other@x.com",
      }),
    ]).rows[0];
    expect(withBilling.email).toBe("kaden@grid.com");

    const receiptOnly = normalizeStripeCharges([
      charge({ billing_details: null, receipt_email: "fallback@x.com" }),
    ]).rows[0];
    expect(receiptOnly.email).toBe("fallback@x.com");

    const neither = normalizeStripeCharges([charge({ billing_details: {} })]).rows[0];
    expect(neither.email).toBeNull();
  });

  it("keeps the charge id on every row so a figure traces back to Stripe", () => {
    const { rows } = normalizeStripeCharges([
      charge({ id: "ch_trace", amount_refunded: 4900 }),
    ]);
    expect(rows.every((r) => r.payload.stripe_charge_id === "ch_trace")).toBe(true);
    expect(rows.map((r) => r.payload.kind)).toEqual(["charge", "refund"]);
  });

  it("numbers rows consecutively across charges and their refunds", () => {
    const { rows } = normalizeStripeCharges([
      charge({ id: "a", amount_refunded: 100 }),
      charge({ id: "b" }),
    ]);
    expect(rows.map((r) => r.rowIndex)).toEqual([1, 2, 3]);
  });

  it("handles an empty pull", () => {
    expect(normalizeStripeCharges([])).toEqual({ rows: [], skippedForeign: [] });
  });

  it("holds up on a real-world charge distribution", () => {
    // Taken from an actual reconciliation: a long tail of low-ticket
    // recurring charges, a handful of large closes, one full refund, and a
    // block of failed attempts. This is the shape that broke hand-logging —
    // the tail is what a human never writes down.
    const HISTOGRAM: [number, number][] = [
      [2700, 6],
      [4700, 1],
      [4900, 92],
      [49_700, 2],
      [99_700, 3],
      [250_000, 2],
      [300_000, 1],
      [400_000, 1],
      [500_000, 4],
      [900_000, 1],
    ];
    const real: StripeCharge[] = HISTOGRAM.flatMap(([amount, count], b) =>
      Array.from({ length: count }, (_, i) => charge({ id: `c_${b}_${i}`, amount })),
    );
    // Exactly one of the three $997 charges was refunded, in full.
    const refundIndex = real.findIndex((c) => c.amount === 99_700);
    real[refundIndex] = { ...real[refundIndex], amount_refunded: 99_700 };
    real.push(
      ...Array.from({ length: 25 }, (_, i) =>
        charge({ id: `f_${i}`, status: "failed" }),
      ),
    );

    const totals = totalPayments(normalizeStripeCharges(real).rows);
    expect(totals.collectedCount).toBe(113);
    expect(totals.grossCents).toBe(4_970_200);
    expect(totals.refundedCents).toBe(99_700);
    expect(totals.netCents).toBe(4_870_500);
    expect(totals.failedCount).toBe(25);

    // The low-ticket tail alone is 92 of the 113 charges but a small share of
    // the money — which is exactly why it goes unlogged, and exactly why
    // omitting it still costs a material amount.
    expect(totals.collectedCount).toBeGreaterThan(100);
  });
});
