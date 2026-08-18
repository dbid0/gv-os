import { describe, expect, it } from "vitest";

import { dealPayoutFromRows } from "@/lib/accounting/deal-adapter";

describe("dealPayoutFromRows", () => {
  it("computes a single Fanbasis payment exactly like the engine", () => {
    const r = dealPayoutFromRows({ contractValueCents: 140_000, danielBps: null }, [
      { eventType: "payment_received", amountCents: 140_000, processor: "fanbasis" },
    ]);
    expect(r.cashCollectedCents).toBe(140_000);
    expect(r.processorFeeCents).toBe(4089); // fee derived, not stored
    expect(r.netCashCents).toBe(135_911);
    expect(r.danielPayoutCents + r.gusPayoutCents).toBe(135_911);
  });

  it("uses the deal's split when set (a historical 30/70)", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: 3000 }, [
      { eventType: "payment_received", amountCents: 100_000, processor: "wire" },
    ]);
    expect(r.danielPayoutCents).toBe(30_000);
    expect(r.gusPayoutCents).toBe(70_000);
  });

  it("falls back to 50/50 when the deal records no split", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, [
      { eventType: "payment_received", amountCents: 100_000, processor: "wire" },
    ]);
    expect(r.danielPayoutCents).toBe(50_000);
    expect(r.gusPayoutCents).toBe(50_000);
  });

  it("treats a refund as cash back with no fee", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, [
      { eventType: "payment_received", amountCents: 100_000, processor: "fanbasis" },
      { eventType: "refund", amountCents: -100_000, processor: "fanbasis" },
    ]);
    expect(r.cashCollectedCents).toBe(0);
    // Only the payment was charged a fee; the refund carried none.
    expect(r.processorFeeCents).toBe(2929);
  });

  it("accepts a refund with no processor (its fee is zero regardless)", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, [
      { eventType: "payment_received", amountCents: 100_000, processor: "wire" },
      { eventType: "refund", amountCents: -40_000, processor: null },
    ]);
    expect(r.cashCollectedCents).toBe(60_000);
    expect(r.processorFeeCents).toBe(0);
  });

  it("ignores non-cash events (payouts, adjustments, stored fees)", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, [
      { eventType: "payment_received", amountCents: 100_000, processor: "wire" },
      { eventType: "payout", amountCents: -50_000, processor: null },
      { eventType: "adjustment", amountCents: 123, processor: null },
      { eventType: "processor_fee", amountCents: -29, processor: "fanbasis" },
    ]);
    expect(r.cashCollectedCents).toBe(100_000);
    expect(r.processorFeeCents).toBe(0); // wire is free; the stored fee row is ignored
    expect(r.netCashCents).toBe(100_000);
  });

  it("handles a deal with no events", () => {
    const r = dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, []);
    expect(r.cashCollectedCents).toBe(0);
    expect(r.balanceDueCents).toBe(100_000);
  });

  it("fails loud on a payment with no processor", () => {
    expect(() =>
      dealPayoutFromRows({ contractValueCents: 100_000, danielBps: null }, [
        { eventType: "payment_received", amountCents: 100_000, processor: null },
      ]),
    ).toThrow(/Unknown processor/);
  });
});
