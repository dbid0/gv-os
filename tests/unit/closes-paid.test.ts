import { describe, expect, it } from "vitest";

import { classifyClose, closesPaid } from "@/lib/tracking/closes-paid";

describe("classifyClose", () => {
  it("an explicit deposit label wins whatever the money says", () => {
    expect(
      classifyClose({ cashCents: 99_700, revenueCents: 99_700, label: "Deposit" }),
    ).toBe("deposit");
  });

  it("a payment-plan label is split pay", () => {
    expect(
      classifyClose({
        cashCents: 250_000,
        revenueCents: 250_000,
        label: "Payment Plan",
      }),
    ).toBe("split");
  });

  it("cash short of revenue is split pay even without a label", () => {
    expect(
      classifyClose({
        cashCents: 250_000,
        revenueCents: 500_000,
        label: "Follow Up Close",
      }),
    ).toBe("split");
  });

  it("cash covering revenue is paid in full — the close channel is not the structure", () => {
    // "One Call Close" and "DM Text Close" describe HOW it closed, not how
    // it paid; the money shape decides.
    expect(
      classifyClose({
        cashCents: 500_000,
        revenueCents: 500_000,
        label: "One Call Close",
      }),
    ).toBe("pif");
  });

  it("no money on the row is unknown, shown as such", () => {
    expect(classifyClose({ cashCents: null, revenueCents: null, label: null })).toBe(
      "unknown",
    );
  });
});

describe("closesPaid", () => {
  it("tallies counts and cash per structure", () => {
    const out = closesPaid([
      { cashCents: 500_000, revenueCents: 500_000, label: "One Call Close" },
      { cashCents: 250_000, revenueCents: 500_000, label: null },
      { cashCents: 99_700, revenueCents: 500_000, label: "Deposit" },
    ]);
    expect(out).toMatchObject({ pif: 1, split: 1, deposit: 1, unknown: 0 });
    expect(out.pifCents).toBe(500_000);
    expect(out.splitCents).toBe(250_000);
    expect(out.depositCents).toBe(99_700);
  });
});
