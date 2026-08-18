import { describe, expect, it } from "vitest";

import { cents } from "@/lib/money";
import {
  basisAmount,
  commissionOnDeal,
  commissionRun,
  topLineSkim,
  type DealAmounts,
} from "@/lib/sales/commission";

const deal = (cash: number, revenue: number): DealAmounts => ({
  cashCollectedCents: cents(cash),
  revenueCents: cents(revenue),
});

describe("basisAmount", () => {
  it("picks cash or revenue by basis", () => {
    const d = deal(90_000, 100_000);
    expect(basisAmount(d, "cash_collected")).toBe(90_000);
    expect(basisAmount(d, "deal_revenue")).toBe(100_000);
  });
});

describe("commissionOnDeal", () => {
  it("a closer earns 10% of cash collected", () => {
    expect(commissionOnDeal(deal(23_494_00, 32_497_00), 1000, "cash_collected")).toBe(
      234_940,
    );
  });

  it("can be based on deal revenue instead", () => {
    expect(commissionOnDeal(deal(90_000, 100_000), 1000, "deal_revenue")).toBe(10_000);
  });

  it("rounds half away from zero, to the cent", () => {
    // 10% of $99.99 = $9.999 -> $10.00
    expect(commissionOnDeal(deal(9999, 9999), 1000, "cash_collected")).toBe(1000);
  });

  it("rejects a negative rate", () => {
    expect(() => commissionOnDeal(deal(1000, 1000), -1, "cash_collected")).toThrow(
      RangeError,
    );
  });
});

describe("commissionRun", () => {
  it("sums per-deal commission, not a percent of the total", () => {
    // Two deals at 10% cash: $9.999 + $9.999 rounds to $10 + $10 = $20,
    // whereas 10% of the $199.98 total would be $19.998 -> $20 as well here,
    // but the per-deal sum is what a rep is actually paid.
    const run = commissionRun(
      [
        { deal: deal(9999, 9999), rateBps: 1000 },
        { deal: deal(9999, 9999), rateBps: 1000 },
      ],
      "cash_collected",
    );
    expect(run.dealCount).toBe(2);
    expect(run.cashCollectedCents).toBe(19_998);
    expect(run.commissionCents).toBe(2000);
    expect(run.totalOwedCents).toBe(2000);
  });

  it("adds base and bonus into total owed", () => {
    const run = commissionRun(
      [{ deal: deal(100_000, 100_000), rateBps: 1000 }],
      "cash_collected",
      {
        baseCents: cents(50_000),
        bonusCents: cents(25_000),
      },
    );
    expect(run.commissionCents).toBe(10_000);
    expect(run.baseCents).toBe(50_000);
    expect(run.bonusCents).toBe(25_000);
    expect(run.totalOwedCents).toBe(85_000);
  });

  it("handles a rep with no deals (base only)", () => {
    const run = commissionRun([], "cash_collected", { baseCents: cents(30_000) });
    expect(run.dealCount).toBe(0);
    expect(run.commissionCents).toBe(0);
    expect(run.totalOwedCents).toBe(30_000);
  });

  it("defaults base and bonus to zero", () => {
    const run = commissionRun(
      [{ deal: deal(100_000, 100_000), rateBps: 1000 }],
      "cash_collected",
    );
    expect(run.baseCents).toBe(0);
    expect(run.bonusCents).toBe(0);
    expect(run.totalOwedCents).toBe(10_000);
  });
});

describe("topLineSkim", () => {
  it("takes a manager's percentage of the team's total once", () => {
    // 3% of $23,494 cash = $704.82
    expect(topLineSkim(deal(23_494_00, 32_497_00), 300, "cash_collected")).toBe(70_482);
  });

  it("can skim on revenue", () => {
    expect(topLineSkim(deal(90_000, 100_000), 300, "deal_revenue")).toBe(3000);
  });

  it("rejects a negative skim", () => {
    expect(() => topLineSkim(deal(1000, 1000), -5, "cash_collected")).toThrow(
      RangeError,
    );
  });
});
