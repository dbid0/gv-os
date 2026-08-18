import { describe, expect, it } from "vitest";

import { cents } from "@/lib/money";
import { type DealAmounts } from "@/lib/sales/commission";
import {
  type CommissionRollup,
  type DealWithSplits,
  type RepComp,
  payoutChecklist,
  rollupCommissions,
} from "@/lib/sales/commission-rollup";

const amounts = (cash: number, revenue: number): DealAmounts => ({
  cashCollectedCents: cents(cash),
  revenueCents: cents(revenue),
});

// A period with three deals: two commissioned, one left uncommissioned.
const DEALS: DealWithSplits[] = [
  {
    // $10,000 collected. Closer rep1 @ 10%, setter rep2 @ 3% + a $50 bonus.
    deal: amounts(1_000_000, 1_000_000),
    splits: [
      { repId: "rep1", role: "closer", rateBps: 1000 },
      { repId: "rep2", role: "setter", rateBps: 300, bonusCents: cents(5_000) },
    ],
  },
  {
    // $5,000 collected. Closer rep1 @ 10%, no bonus.
    deal: amounts(500_000, 500_000),
    splits: [{ repId: "rep1", role: "closer", rateBps: 1000 }],
  },
  {
    // $2,000 collected but nobody assigned — counted, not dropped.
    deal: amounts(200_000, 200_000),
    splits: [],
  },
];

const COMPS: RepComp[] = [
  { repId: "rep1", role: "closer" },
  { repId: "rep2", role: "setter", basePayCents: cents(100_000) },
  { repId: "rep3", role: "manager", topLineSkimBps: 300 },
];

describe("rollupCommissions", () => {
  const rollup = rollupCommissions(DEALS, COMPS, "cash_collected");

  it("totals the team's cash and revenue across every deal", () => {
    expect(rollup.teamCashCents).toBe(1_700_000);
    expect(rollup.teamRevenueCents).toBe(1_700_000);
  });

  it("counts deals left without a split instead of dropping them", () => {
    expect(rollup.dealsMissingSplits).toBe(1);
  });

  it("pays a closer the sum of their per-deal commissions", () => {
    const rep1 = rollup.reps.find((r) => r.repId === "rep1")!;
    // $10,000 @ 10% + $5,000 @ 10% = $1,000 + $500.
    expect(rep1.run.commissionCents).toBe(150_000);
    expect(rep1.skimCents).toBe(0);
    expect(rep1.totalOwedCents).toBe(150_000);
  });

  it("adds a rep's base and per-deal bonus on top of commission", () => {
    const rep2 = rollup.reps.find((r) => r.repId === "rep2")!;
    // $10,000 @ 3% = $300 commission, + $1,000 base + $50 bonus.
    expect(rep2.run.commissionCents).toBe(30_000);
    expect(rep2.run.baseCents).toBe(100_000);
    expect(rep2.run.bonusCents).toBe(5_000);
    expect(rep2.totalOwedCents).toBe(135_000);
  });

  it("pays a manager a skim of the team total, with no deals of their own", () => {
    const rep3 = rollup.reps.find((r) => r.repId === "rep3")!;
    expect(rep3.run.dealCount).toBe(0);
    // 3% of $17,000 team cash.
    expect(rep3.skimCents).toBe(51_000);
    expect(rep3.totalOwedCents).toBe(51_000);
  });

  it("orders comped reps first and totals what the team is owed", () => {
    expect(rollup.reps.map((r) => r.repId)).toEqual(["rep1", "rep2", "rep3"]);
    expect(rollup.totalOwedCents).toBe(336_000);
  });

  it("gives a rep who closed without a comp row their split anyway", () => {
    const rollup = rollupCommissions(
      [
        {
          deal: amounts(100_000, 100_000),
          splits: [{ repId: "rep9", role: "closer", rateBps: 1000 }],
        },
      ],
      [],
      "cash_collected",
    );
    expect(rollup.reps).toHaveLength(1);
    expect(rollup.reps[0].repId).toBe("rep9");
    expect(rollup.reps[0].role).toBe("closer");
    expect(rollup.reps[0].totalOwedCents).toBe(10_000);
    expect(rollup.dealsMissingSplits).toBe(0);
  });

  it("can commission on deal revenue instead of cash collected", () => {
    const rollup = rollupCommissions(
      [
        {
          deal: amounts(50_000, 100_000),
          splits: [{ repId: "rep1", role: "closer", rateBps: 1000 }],
        },
      ],
      [{ repId: "rep1", role: "closer" }],
      "deal_revenue",
    );
    // 10% of the $1,000 revenue, not the $500 collected.
    expect(rollup.reps[0].totalOwedCents).toBe(10_000);
  });
});

describe("payoutChecklist", () => {
  const rollup = rollupCommissions(DEALS, COMPS, "cash_collected");

  it("splits a run into paid and unpaid by rep", () => {
    const check = payoutChecklist(rollup, new Set(["rep1"]));
    expect(check.paidCents).toBe(150_000);
    expect(check.unpaidCents).toBe(186_000);
    expect(check.allPaid).toBe(false);
    expect(check.lines.find((l) => l.repId === "rep1")!.paid).toBe(true);
  });

  it("reports allPaid once every rep is marked", () => {
    const check = payoutChecklist(rollup, new Set(["rep1", "rep2", "rep3"]));
    expect(check.allPaid).toBe(true);
    expect(check.unpaidCents).toBe(0);
    expect(check.paidCents).toBe(336_000);
  });

  it("treats everyone as unpaid when no set is given", () => {
    const check = payoutChecklist(rollup);
    expect(check.paidCents).toBe(0);
    expect(check.unpaidCents).toBe(336_000);
    expect(check.allPaid).toBe(false);
  });

  it("an empty run is trivially all paid", () => {
    const empty: CommissionRollup = rollupCommissions([], [], "cash_collected");
    const check = payoutChecklist(empty);
    expect(check.lines).toHaveLength(0);
    expect(check.paidCents).toBe(0);
    expect(check.unpaidCents).toBe(0);
    expect(check.allPaid).toBe(true);
  });
});
