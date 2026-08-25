import { describe, expect, it } from "vitest";

import {
  computeRepTrends,
  trendDelta,
  type DayActivity,
  type DayDeal,
  type RepInfo,
} from "@/lib/sales/rep-trends";

describe("trendDelta", () => {
  it("reads direction from prior -> current", () => {
    expect(trendDelta({ current: 10, prior: 5 }).direction).toBe("up");
    expect(trendDelta({ current: 5, prior: 10 }).direction).toBe("down");
    expect(trendDelta({ current: 7, prior: 7 }).direction).toBe("flat");
  });

  it("computes a percent, or null when there was nothing prior", () => {
    expect(trendDelta({ current: 15, prior: 10 }).pct).toBe(50);
    expect(trendDelta({ current: 5, prior: 10 }).pct).toBe(-50);
    expect(trendDelta({ current: 8, prior: 0 }).pct).toBeNull();
  });
});

describe("computeRepTrends", () => {
  const today = "2026-08-24"; // reference "today"
  const reps: RepInfo[] = [
    { repId: "r1", name: "Alpha", teamName: "The Grid" },
    { repId: "r2", name: "Beta", teamName: "The Vault" },
    { repId: "r3", name: "Idle", teamName: null },
  ];
  // r1: strong this week; r2: only last week.
  const activity: DayActivity[] = [
    { repId: "r1", day: "2026-08-20", dials: 100, shows: 5 }, // this week
    { repId: "r1", day: "2026-08-15", dials: 40, shows: 2 }, // last week
    { repId: "r2", day: "2026-08-16", dials: 30, shows: 3 }, // last week only
  ];
  const deals: DayDeal[] = [
    { repId: "r1", day: "2026-08-21", cashCents: 500_000 }, // this week
    { repId: "r1", day: "2026-08-14", cashCents: 200_000 }, // last week
  ];

  it("buckets each rep into current vs prior 7-day windows", () => {
    const { week } = computeRepTrends(reps, activity, deals, today);
    const r1 = week.find((r) => r.repId === "r1")!;
    expect(r1.cashCents).toEqual({ current: 500_000, prior: 200_000 });
    expect(r1.deals).toEqual({ current: 1, prior: 1 });
    expect(r1.dials).toEqual({ current: 100, prior: 40 });
    expect(trendDelta(r1.cashCents).pct).toBe(150);
  });

  it("drops reps with no activity in either window", () => {
    const { week } = computeRepTrends(reps, activity, deals, today);
    expect(week.some((r) => r.repId === "r3")).toBe(false);
  });

  it("sorts by current cash, highest first", () => {
    const { week } = computeRepTrends(reps, activity, deals, today);
    expect(week[0].repId).toBe("r1"); // has current cash
  });

  it("rolls a 30-day window that captures both weeks as current", () => {
    const { month } = computeRepTrends(reps, activity, deals, today);
    const r1 = month.find((r) => r.repId === "r1")!;
    // All of r1's August activity falls inside the current 30-day window.
    expect(r1.dials.current).toBe(140);
    expect(r1.cashCents.current).toBe(700_000);
  });
});
