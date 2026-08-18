import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { cents } from "@/lib/money";
import { computeDealPayout, resolveDanielBps } from "@/lib/accounting/payout";

describe("computeDealPayout — the sheet's chain, to the cent", () => {
  it("a single Fanbasis payment collected in full, split 50/50", () => {
    const r = computeDealPayout({
      contractValueCents: cents(140_000),
      payments: [{ amountCents: cents(140_000), processor: "fanbasis" }],
      danielBps: 5000,
    });
    expect(r.cashCollectedCents).toBe(140_000);
    expect(r.processorFeeCents).toBe(4089); // $40.89
    expect(r.netCashCents).toBe(135_911); // $1,359.11
    expect(r.balanceDueCents).toBe(0);
    // $1,359.11 is odd — one partner takes the extra cent, and they still sum to net.
    expect(r.danielPayoutCents + r.gusPayoutCents).toBe(135_911);
    expect(r.danielPayoutCents).toBe(67_956);
    expect(r.gusPayoutCents).toBe(67_955);
  });

  it("a wire pays no processor fee, so net equals cash", () => {
    const r = computeDealPayout({
      contractValueCents: cents(500_000),
      payments: [{ amountCents: cents(500_000), processor: "wire" }],
      danielBps: 5000,
    });
    expect(r.processorFeeCents).toBe(0);
    expect(r.netCashCents).toBe(500_000);
    expect(r.danielPayoutCents).toBe(250_000);
    expect(r.gusPayoutCents).toBe(250_000);
  });

  it("a partial collection leaves the balance as receivable", () => {
    const r = computeDealPayout({
      contractValueCents: cents(200_000),
      payments: [{ amountCents: cents(140_000), processor: "wire" }],
      danielBps: 5000,
    });
    expect(r.balanceDueCents).toBe(60_000); // $600 still owed
  });

  it("overpayment clamps receivable to zero, never negative", () => {
    const r = computeDealPayout({
      contractValueCents: cents(100_000),
      payments: [{ amountCents: cents(140_000), processor: "wire" }],
      danielBps: 5000,
    });
    expect(r.balanceDueCents).toBe(0);
  });

  it("charges the flat Fanbasis fee once per transaction", () => {
    const r = computeDealPayout({
      contractValueCents: cents(200_000),
      payments: [
        { amountCents: cents(100_000), processor: "fanbasis" },
        { amountCents: cents(100_000), processor: "fanbasis" },
      ],
      danielBps: 5000,
    });
    // Two transactions: 2 x ($29.00 + $0.29) = $58.58, not one $58.29.
    expect(r.processorFeeCents).toBe(2929 * 2);
    expect(r.cashCollectedCents).toBe(200_000);
  });

  it("honours the 30/70 override", () => {
    const r = computeDealPayout({
      contractValueCents: cents(100_000),
      payments: [{ amountCents: cents(100_000), processor: "wire" }],
      danielBps: 3000,
    });
    expect(r.danielPayoutCents).toBe(30_000);
    expect(r.gusPayoutCents).toBe(70_000);
  });

  it("a fee override replaces the by-method calculation", () => {
    const r = computeDealPayout({
      contractValueCents: cents(140_000),
      payments: [
        {
          amountCents: cents(140_000),
          processor: "fanbasis",
          feeOverrideCents: cents(5000),
        },
      ],
      danielBps: 5000,
    });
    expect(r.processorFeeCents).toBe(5000);
    expect(r.netCashCents).toBe(135_000);
  });

  it("splits a refund the same way it split the payment, back to zero", () => {
    const payment = computeDealPayout({
      contractValueCents: cents(100_000),
      payments: [{ amountCents: cents(100_000), processor: "wire" }],
      danielBps: 4500,
    });
    const refund = computeDealPayout({
      contractValueCents: cents(100_000),
      payments: [{ amountCents: cents(-100_000), processor: "wire" }],
      danielBps: 4500,
    });
    expect(payment.danielPayoutCents + refund.danielPayoutCents).toBe(0);
    expect(payment.gusPayoutCents + refund.gusPayoutCents).toBe(0);
  });

  it("rejects a share outside 0..100%", () => {
    expect(() =>
      computeDealPayout({
        contractValueCents: cents(0),
        payments: [],
        danielBps: 10_001,
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeDealPayout({ contractValueCents: cents(0), payments: [], danielBps: -1 }),
    ).toThrow(RangeError);
  });

  it("handles a deal with no payments", () => {
    const r = computeDealPayout({
      contractValueCents: cents(100_000),
      payments: [],
      danielBps: 5000,
    });
    expect(r.cashCollectedCents).toBe(0);
    expect(r.netCashCents).toBe(0);
    expect(r.balanceDueCents).toBe(100_000);
    expect(r.danielPayoutCents).toBe(0);
    expect(r.gusPayoutCents).toBe(0);
  });

  it("the partners always sum to exactly net cash (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (net, bps) => {
          const r = computeDealPayout({
            contractValueCents: cents(0),
            payments: [{ amountCents: cents(net), processor: "wire" }],
            danielBps: bps,
          });
          return r.danielPayoutCents + r.gusPayoutCents === r.netCashCents;
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("resolveDanielBps — the 50/50 rule, stated once", () => {
  it("Client Handoff is always 50/50", () => {
    expect(resolveDanielBps("Client Handoff", 30)).toBe(5000);
    expect(resolveDanielBps("client handoff", null)).toBe(5000);
  });

  it("a blank percentage defaults to 50/50", () => {
    expect(resolveDanielBps("Setup", null)).toBe(5000);
    expect(resolveDanielBps("Setup", undefined)).toBe(5000);
  });

  it("uses the entered percentage otherwise", () => {
    expect(resolveDanielBps("Setup", 50)).toBe(5000);
    expect(resolveDanielBps("Setup", 45)).toBe(4500);
    expect(resolveDanielBps("Setup", 40)).toBe(4000);
    expect(resolveDanielBps("DFY Build", 30)).toBe(3000);
  });

  it("rejects a percentage that is not a whole basis point", () => {
    expect(() => resolveDanielBps("Setup", 33.333)).toThrow();
  });
});
