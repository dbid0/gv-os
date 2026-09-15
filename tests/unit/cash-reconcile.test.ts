import { describe, expect, it } from "vitest";

import {
  reconcileCash,
  type DealRow,
  type PaymentRow,
} from "@/lib/tracking/cash-reconcile";

const deal = (
  email: string | null,
  cents: number,
  program: string | null = "Mastermind",
): DealRow => ({
  email,
  cashCents: cents,
  program,
  occurredAt: null,
});
const pay = (
  email: string | null,
  cents: number,
  processor: string | null = "Stripe",
): PaymentRow => ({
  email,
  cashCents: cents,
  processor,
});

describe("reconcileCash", () => {
  it("NEVER adds the two tabs together", () => {
    // The same sale appears in both. Summing counts the money twice.
    const r = reconcileCash([deal("a@x.com", 99_700)], [pay("a@x.com", 99_700)]);
    expect(r.dealsCents).toBe(99_700);
    expect(r.processorCents).toBe(99_700);
    expect(r.unbackedCents).toBe(0);
  });

  it("names deals no processor can see — wires and Zelle", () => {
    // The deal form is the ONLY evidence money that never touched a processor
    // arrived at all, so it is reported, not treated as an error.
    const r = reconcileCash(
      [deal("wire@x.com", 750_000, "Mastermind"), deal("card@x.com", 99_700)],
      [pay("card@x.com", 99_700)],
    );
    expect(r.unbackedDeals).toHaveLength(1);
    expect(r.unbackedDeals[0].email).toBe("wire@x.com");
    expect(r.unbackedCents).toBe(750_000);
  });

  it("shows a payment plan as a partial, not a discrepancy to hide", () => {
    // A $5,000 deal with $2,500 processed so far is normal, and both figures
    // are true.
    const r = reconcileCash([deal("p@x.com", 500_000)], [pay("p@x.com", 250_000)]);
    expect(r.dealsCents).toBe(500_000);
    expect(r.processorCents).toBe(250_000);
    // It is backed — a payment exists — so it is not listed as unbacked.
    expect(r.unbackedDeals).toEqual([]);
  });

  it("counts payments that tie to no logged deal", () => {
    // Live data: three payment rows carry no email at all.
    const r = reconcileCash(
      [deal("a@x.com", 100)],
      [pay(null, 699_400), pay("nobody@x.com", 500)],
    );
    expect(r.unmatchedPaymentCount).toBe(2);
    expect(r.unmatchedPaymentCents).toBe(699_900);
  });

  it("breaks the processors out so a retired one is visible", () => {
    // Shopify is retired but still holds real money on Client North's sheet.
    const r = reconcileCash(
      [],
      [pay("a@x.com", 100, "Stripe"), pay("b@x.com", 300, "Shopify")],
    );
    expect(r.byProcessor[0]).toEqual({ processor: "Shopify", cents: 300, count: 1 });
    expect(r.byProcessor[1].processor).toBe("Stripe");
  });

  it("labels a payment with no processor rather than dropping it", () => {
    const r = reconcileCash([], [pay("a@x.com", 100, null)]);
    expect(r.byProcessor[0].processor).toBe("Unrecorded");
  });

  it("matches on email regardless of case or spacing", () => {
    const r = reconcileCash([deal("  A@X.com ", 100)], [pay("a@x.com", 100)]);
    expect(r.unbackedDeals).toEqual([]);
  });

  it("ignores a deal with no email rather than calling it unbacked", () => {
    // Nothing can be matched to it either way; claiming it is unpaid would be
    // an accusation the data does not support.
    const r = reconcileCash([deal(null, 100)], []);
    expect(r.unbackedDeals).toEqual([]);
    expect(r.dealsCents).toBe(100);
  });

  it("is all zeros for an offer with nothing logged", () => {
    const r = reconcileCash([], []);
    expect(r).toMatchObject({ dealsCents: 0, processorCents: 0, unbackedCents: 0 });
  });

  it("sorts unbacked deals largest first — the biggest gap is the story", () => {
    const r = reconcileCash([deal("s@x.com", 99_700), deal("b@x.com", 900_000)], []);
    expect(r.unbackedDeals.map((d) => d.email)).toEqual(["b@x.com", "s@x.com"]);
  });
});

describe("failed charges in the reconciliation", () => {
  const failed = (email: string, cents: number): PaymentRow => ({
    email,
    cashCents: cents,
    processor: "Stripe",
    status: "failed",
  });

  it("a FAILED charge does not back a deal — that's the declined-card blind spot", () => {
    // The deal died on a declined card. The failed attempt used to make it
    // look backed, hiding exactly the money worth chasing.
    const r = reconcileCash([deal("a@x.com", 500_000)], [failed("a@x.com", 500_000)]);
    expect(r.unbackedDeals).toHaveLength(1);
    expect(r.unbackedCents).toBe(500_000);
  });

  it("a REFUNDED charge does not back a deal — the money came and left", () => {
    const r = reconcileCash(
      [deal("a@x.com", 99_700)],
      [
        {
          email: "a@x.com",
          cashCents: 99_700,
          processor: "Stripe",
          status: "refunded",
        },
      ],
    );
    expect(r.unbackedDeals).toHaveLength(1);
  });

  it("a failed charge with no deal is NOT unmatched money — nothing arrived", () => {
    const r = reconcileCash([], [failed("ghost@x.com", 500_000)]);
    expect(r.unmatchedPaymentCents).toBe(0);
    expect(r.unmatchedPaymentCount).toBe(0);
    // It still shows in the failed bucket, reported separately.
    expect(r.failedCents).toBe(500_000);
  });

  it("collected money still backs and still matches", () => {
    const r = reconcileCash(
      [deal("a@x.com", 100_000)],
      [pay("a@x.com", 100_000), pay("extra@x.com", 4_900)],
    );
    expect(r.unbackedDeals).toHaveLength(0);
    expect(r.unmatchedPaymentCents).toBe(4_900);
  });
});
