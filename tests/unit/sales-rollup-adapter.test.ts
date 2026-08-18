import { describe, expect, it } from "vitest";

import { cents } from "@/lib/money";
import { buildRollupInputs, rollupFromRows } from "@/lib/sales/rollup-adapter";
import type { CommissionSplit, Deal, Rep } from "@/db/schema/app";

const T = new Date("2026-08-18T00:00:00Z");

const makeDeal = (over: Partial<Deal> = {}): Deal => ({
  id: "d1",
  clientId: "c1",
  dealType: "Setup",
  offer: null,
  contractValueCents: 0,
  closedAt: null,
  agreementSigned: null,
  notes: null,
  repId: null,
  recurrence: null,
  source: null,
  leadSource: null,
  customerName: null,
  externalRef: null,
  importBatchId: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

const makeRep = (over: Partial<Rep> = {}): Rep => ({
  id: "r1",
  clientId: "c1",
  profileId: null,
  name: "Rep",
  role: "closer",
  commissionBps: null,
  basePayCents: null,
  topLineSkimBps: null,
  status: "active",
  externalRef: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

const makeSplit = (over: Partial<CommissionSplit> = {}): CommissionSplit => ({
  id: "s1",
  dealId: "d1",
  repId: "r1",
  role: "closer",
  rateBps: 1000,
  basis: "cash_collected",
  bonusCents: null,
  note: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

// Three deals; d1 collected $8,000 of its $10,000, d2 collected nothing yet,
// and d3 is closed but carries no split at all.
const DEALS: Deal[] = [
  makeDeal({ id: "d1", contractValueCents: 1_000_000 }),
  makeDeal({ id: "d2", contractValueCents: 500_000 }),
  makeDeal({ id: "d3", contractValueCents: 200_000 }),
];
const CASH = new Map([["d1", cents(800_000)]]);

const SPLITS: CommissionSplit[] = [
  makeSplit({
    id: "s1",
    dealId: "d1",
    repId: "r1",
    role: "closer",
    rateBps: 1000,
    bonusCents: 5_000,
  }),
  makeSplit({ id: "s2", dealId: "d1", repId: "r2", role: "setter", rateBps: 300 }),
  makeSplit({ id: "s3", dealId: "d2", repId: "r1", role: "closer", rateBps: 1000 }),
  // Orphan: names a deal not in this period — must be ignored.
  makeSplit({ id: "s4", dealId: "d99", repId: "r1", role: "closer", rateBps: 1000 }),
];

const REPS: Rep[] = [
  makeRep({ id: "r1", role: "closer" }),
  makeRep({ id: "r2", role: "setter", basePayCents: 100_000 }),
  makeRep({ id: "r3", role: "manager", topLineSkimBps: 300 }),
];

describe("buildRollupInputs", () => {
  const { deals, comps } = buildRollupInputs(DEALS, SPLITS, REPS, CASH);

  it("takes revenue from the deal and cash from the ledger lookup", () => {
    const d1 = deals.find((d) => d.deal.revenueCents === 1_000_000)!;
    expect(d1.deal.cashCollectedCents).toBe(800_000);
  });

  it("treats a deal absent from the cash lookup as zero collected", () => {
    const d2 = deals.find((d) => d.deal.revenueCents === 500_000)!;
    expect(d2.deal.cashCollectedCents).toBe(0);
  });

  it("attaches every split to its deal, leaves split-less deals empty, ignores orphans", () => {
    const d1 = deals.find((d) => d.deal.revenueCents === 1_000_000)!;
    const d2 = deals.find((d) => d.deal.revenueCents === 500_000)!;
    const d3 = deals.find((d) => d.deal.revenueCents === 200_000)!;
    expect(d1.splits).toHaveLength(2);
    expect(d2.splits).toHaveLength(1);
    expect(d3.splits).toHaveLength(0);
    // s4 named d99, which is not in the deal set, so it appears nowhere.
    expect(deals.flatMap((d) => d.splits)).toHaveLength(3);
  });

  it("carries a bonus only when the split has one", () => {
    const d1 = deals.find((d) => d.deal.revenueCents === 1_000_000)!;
    const closer = d1.splits.find((s) => s.role === "closer")!;
    const setter = d1.splits.find((s) => s.role === "setter")!;
    expect(closer.bonusCents).toBe(5_000);
    expect(setter.bonusCents).toBeUndefined();
  });

  it("maps a rep's base and skim only when set", () => {
    const r1 = comps.find((c) => c.repId === "r1")!;
    const r2 = comps.find((c) => c.repId === "r2")!;
    const r3 = comps.find((c) => c.repId === "r3")!;
    expect(r1.basePayCents).toBeUndefined();
    expect(r1.topLineSkimBps).toBeUndefined();
    expect(r2.basePayCents).toBe(100_000);
    expect(r2.topLineSkimBps).toBeUndefined();
    expect(r3.topLineSkimBps).toBe(300);
    expect(r3.basePayCents).toBeUndefined();
  });
});

describe("rollupFromRows", () => {
  it("computes the whole team's owed position from rows, to the cent", () => {
    const rollup = rollupFromRows(DEALS, SPLITS, REPS, CASH, "cash_collected");

    const r1 = rollup.reps.find((r) => r.repId === "r1")!;
    const r2 = rollup.reps.find((r) => r.repId === "r2")!;
    const r3 = rollup.reps.find((r) => r.repId === "r3")!;

    // r1: $8,000 @ 10% + $0 @ 10% = $800, plus a $50 bonus.
    expect(r1.totalOwedCents).toBe(85_000);
    // r2: $8,000 @ 3% = $240, plus $1,000 base.
    expect(r2.totalOwedCents).toBe(124_000);
    // r3: 3% of the $8,000 team cash, no deals of their own.
    expect(r3.skimCents).toBe(24_000);

    expect(rollup.totalOwedCents).toBe(233_000);
    // d3 is closed but carries no split — surfaced, not silently dropped.
    expect(rollup.dealsMissingSplits).toBe(1);
  });
});
