import { describe, expect, it } from "vitest";

import { summarizeBacklog, type DirectionalRow } from "@/lib/transactions/summary";

const row = (over: Partial<DirectionalRow>): DirectionalRow => ({
  direction: "in",
  revenueCents: 0,
  cashCents: 0,
  processorFeeCents: 0,
  ...over,
});

describe("summarizeBacklog", () => {
  it("NEVER adds money out to money in", () => {
    // The live defect: 27 expense rows worth $17,535 were added to "Cash
    // collected", reporting $808,001 where $790,466 actually came in.
    const t = summarizeBacklog([
      row({ direction: "in", cashCents: 790_466_00 }),
      row({ direction: "out", cashCents: 17_535_00 }),
    ]);
    expect(t.cashInCents).toBe(790_466_00);
    expect(t.cashOutCents).toBe(17_535_00);
    expect(t.netCents).toBe(790_466_00 - 17_535_00);
  });

  it("books revenue only on inbound rows", () => {
    // An expense has no revenue to book.
    const t = summarizeBacklog([
      row({ direction: "in", revenueCents: 10_000 }),
      row({ direction: "out", revenueCents: 99_999, cashCents: 500 }),
    ]);
    expect(t.revenueCents).toBe(10_000);
  });

  it("treats an outbound amount as a magnitude, however it was stored", () => {
    // Direction is what makes it negative, not the sign of the number.
    const positive = summarizeBacklog([row({ direction: "out", cashCents: 2_500 })]);
    const negative = summarizeBacklog([row({ direction: "out", cashCents: -2_500 })]);
    expect(positive.cashOutCents).toBe(2_500);
    expect(negative.cashOutCents).toBe(2_500);
  });

  it("counts processor fees on both directions", () => {
    // A refund still costs a fee.
    const t = summarizeBacklog([
      row({ direction: "in", processorFeeCents: 300 }),
      row({ direction: "out", processorFeeCents: 100 }),
    ]);
    expect(t.processorFeeCents).toBe(400);
  });

  it("reports how many rows went each way", () => {
    const t = summarizeBacklog([
      row({ direction: "in" }),
      row({ direction: "in" }),
      row({ direction: "out" }),
    ]);
    expect(t.rowsIn).toBe(2);
    expect(t.rowsOut).toBe(1);
  });

  it("is all zeros for an empty view, and net is zero not undefined", () => {
    const t = summarizeBacklog([]);
    expect(t).toMatchObject({
      cashInCents: 0,
      cashOutCents: 0,
      netCents: 0,
      revenueCents: 0,
    });
  });

  it("goes negative when more left than arrived", () => {
    const t = summarizeBacklog([
      row({ direction: "in", cashCents: 100 }),
      row({ direction: "out", cashCents: 400 }),
    ]);
    expect(t.netCents).toBe(-300);
  });

  it("counts a row with an unrecognised direction apart, never as income", () => {
    // A bad import must not become revenue, and must not vanish either.
    const t = summarizeBacklog([
      row({ direction: "in", cashCents: 100, revenueCents: 100 }),
      row({ direction: "sideways", cashCents: 999_999, revenueCents: 999_999 }),
    ]);
    expect(t.cashInCents).toBe(100);
    expect(t.revenueCents).toBe(100);
    expect(t.rowsUnknown).toBe(1);
  });
});
