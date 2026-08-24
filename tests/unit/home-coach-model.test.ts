import { describe, expect, it } from "vitest";

import {
  buildCoachModel,
  type CoachActiveRep,
  type CoachEodDay,
  type CoachInput,
  type CoachQuota,
  type CoachRepStat,
} from "@/lib/home/coach-model";

const TODAY = "2026-08-24"; // period 2026-08, prev 2026-07

function baseInput(over: Partial<CoachInput> = {}): CoachInput {
  return {
    isAllOffers: true,
    scopeLabel: "All offers",
    monthCashCents: 0,
    monthDealsClosed: 0,
    monthRevenueCents: 0,
    prevMonthDealsClosed: 0,
    quotas: [],
    reps: [],
    eodDays: [],
    activeReps: [],
    todayKey: TODAY,
    period: "2026-08",
    prevPeriod: "2026-07",
    ...over,
  };
}

const quota = (over: Partial<CoachQuota>): CoachQuota => ({
  scope: "rep",
  repName: "Rep",
  teamName: "Grid",
  metricLabel: "Deals closed",
  status: "on_track",
  attainmentPct: 0.5,
  isPast: false,
  ...over,
});

const rep = (over: Partial<CoachRepStat>): CoachRepStat => ({
  repId: "r",
  name: "Rep",
  teamName: "Grid",
  cashCents: 0,
  dealsClosed: 0,
  shows: 0,
  ...over,
});

const active = (over: Partial<CoachActiveRep>): CoachActiveRep => ({
  id: "r",
  name: "Rep",
  teamName: "Grid",
  ...over,
});

const eod = (over: Partial<CoachEodDay>): CoachEodDay => ({
  repId: "r",
  dayKey: "2026-08-24",
  shows: 0,
  noShows: 0,
  ...over,
});

describe("buildCoachModel — a full floor", () => {
  const model = buildCoachModel(
    baseInput({
      monthCashCents: 500_000,
      monthDealsClosed: 8,
      monthRevenueCents: 800_000,
      prevMonthDealsClosed: 2,
      quotas: [
        quota({
          scope: "team",
          repName: null,
          metricLabel: "Cash",
          status: "ahead",
          attainmentPct: 1.2,
        }),
        quota({ repName: "Ann", status: "on_track", attainmentPct: 0.6 }),
        quota({ repName: "Bob", status: "behind", attainmentPct: 0.3 }),
        quota({
          repName: null,
          teamName: null,
          metricLabel: "Shows",
          status: "behind",
          attainmentPct: 0.1,
        }),
        quota({
          scope: "team",
          repName: null,
          metricLabel: "Cash",
          status: "behind",
          attainmentPct: 0.2,
        }),
        quota({ repName: "Cy", status: "behind", attainmentPct: 0.5, isPast: true }),
      ],
      reps: [
        rep({ repId: "r1", name: "Ann", cashCents: 500_000, dealsClosed: 5, shows: 8 }),
        rep({ repId: "r2", name: "Bob", cashCents: 200_000, dealsClosed: 2, shows: 5 }),
        rep({ repId: "r3", name: "Cy", cashCents: 0, dealsClosed: 0, shows: 4 }),
      ],
      eodDays: [
        eod({ repId: "r1", dayKey: "2026-08-24", shows: 8, noShows: 2 }),
        eod({ repId: "r2", dayKey: "2026-08-20", shows: 5, noShows: 5 }),
        eod({ repId: "r3", dayKey: "2026-07-15", shows: 4, noShows: 1 }),
        eod({ repId: "r1", dayKey: "2026-08-01", shows: 3, noShows: 0 }),
      ],
      activeReps: [
        active({ id: "r1", name: "Ann" }),
        active({ id: "r2", name: "Bob" }),
        active({ id: "r3", name: "Cy" }),
      ],
    }),
  );

  it("carries the scoped month totals through", () => {
    expect(model.offers).toEqual({
      cashCents: 500_000,
      dealsClosed: 8,
      revenueCents: 800_000,
      isAllOffers: true,
      scopeLabel: "All offers",
    });
  });

  it("summarizes active quotas and lists rep-scope laggards worst-first", () => {
    expect(model.quota.total).toBe(5);
    expect(model.quota.ahead).toBe(1);
    expect(model.quota.onTrack).toBe(1);
    expect(model.quota.behind).toBe(3);
    // Team-scope 'behind' and past quotas are excluded from the rep list.
    expect(model.quota.repsBehind.map((r) => r.name)).toEqual([
      "Unassigned rep",
      "Bob",
    ]);
    expect(model.quota.repsBehind[0].teamName).toBeNull();
    expect(model.quota.repsBehind[0].attainmentPct).toBe(0.1);
  });

  it("counts EOD compliance for today and the trailing week", () => {
    expect(model.eodToday).toEqual({ submitted: 1, total: 3, missing: ["Bob", "Cy"] });
    expect(model.eodWeek).toEqual({ submitted: 2, total: 3, missing: ["Cy"] });
  });

  it("derives close and show rate for the month with a trend arrow", () => {
    // cur close = 8 deals / 16 shows = 0.5; prev = 2/4 = 0.5 => flat.
    expect(model.closeRate.rate).toBeCloseTo(0.5, 5);
    expect(model.closeRate.delta).toBe("flat");
    // cur show = 16/23 ≈ 0.696; prev = 4/5 = 0.8 => down.
    expect(model.showRate.rate).toBeCloseTo(16 / 23, 5);
    expect(model.showRate.delta).toBe("down");
  });

  it("names the top and bottom rep from the ranked list", () => {
    expect(model.topRep?.name).toBe("Ann");
    expect(model.bottomRep?.name).toBe("Cy");
    expect(model.hasReps).toBe(true);
    expect(model.hasData).toBe(true);
  });
});

describe("buildCoachModel — honest empty states", () => {
  it("returns null reps and null rates with nothing on the floor", () => {
    const model = buildCoachModel(
      baseInput({ isAllOffers: false, scopeLabel: "Grid" }),
    );
    expect(model.offers.isAllOffers).toBe(false);
    expect(model.offers.scopeLabel).toBe("Grid");
    expect(model.quota.total).toBe(0);
    expect(model.quota.repsBehind).toEqual([]);
    expect(model.eodToday).toEqual({ submitted: 0, total: 0, missing: [] });
    expect(model.closeRate).toEqual({ rate: null, delta: null });
    expect(model.showRate).toEqual({ rate: null, delta: null });
    expect(model.topRep).toBeNull();
    expect(model.bottomRep).toBeNull();
    expect(model.hasReps).toBe(false);
    expect(model.hasData).toBe(false);
  });

  it("a single rep has a top but no bottom, and lights hasData via rep cash", () => {
    const model = buildCoachModel(
      baseInput({ reps: [rep({ cashCents: 100 })], activeReps: [] }),
    );
    expect(model.topRep?.cashCents).toBe(100);
    expect(model.bottomRep).toBeNull();
    expect(model.hasReps).toBe(true); // via reps.length, activeReps empty
    expect(model.hasData).toBe(true); // via reps.some(cash>0)
  });

  it("lights hasData off any rep signal, and stays dark when every rep is at zero", () => {
    const dealsOnly = buildCoachModel(
      baseInput({ reps: [rep({ cashCents: 0, dealsClosed: 3, shows: 0 })] }),
    );
    expect(dealsOnly.hasData).toBe(true);

    const showsOnly = buildCoachModel(
      baseInput({ reps: [rep({ cashCents: 0, dealsClosed: 0, shows: 5 })] }),
    );
    expect(showsOnly.hasData).toBe(true);

    const allZero = buildCoachModel(
      baseInput({ reps: [rep({ cashCents: 0, dealsClosed: 0, shows: 0 })] }),
    );
    expect(allZero.hasData).toBe(false);
    expect(allZero.hasReps).toBe(true);
  });
});

describe("buildCoachModel — rate trends and windows", () => {
  it("reads an improving show rate as up", () => {
    const model = buildCoachModel(
      baseInput({
        monthDealsClosed: 9,
        prevMonthDealsClosed: 1,
        eodDays: [
          eod({ dayKey: "2026-08-10", shows: 9, noShows: 1 }), // cur 0.9
          eod({ dayKey: "2026-07-10", shows: 5, noShows: 5 }), // prev 0.5
        ],
      }),
    );
    expect(model.showRate.delta).toBe("up");
    expect(model.closeRate.delta).toBe("up"); // 9/9=1.0 vs 1/5=0.2
  });

  it("a month with shows but no prior month reads as no trend", () => {
    const model = buildCoachModel(
      baseInput({
        monthDealsClosed: 4,
        eodDays: [eod({ dayKey: "2026-08-05", shows: 4, noShows: 1 })],
      }),
    );
    expect(model.showRate.rate).toBeCloseTo(4 / 5, 5);
    expect(model.showRate.delta).toBeNull(); // prev month null
    expect(model.closeRate.rate).toBeCloseTo(1, 5);
    expect(model.closeRate.delta).toBeNull();
  });

  it("honors an explicit week window length", () => {
    const model = buildCoachModel(
      baseInput({
        weekWindowDays: 3, // 2026-08-24, -23, -22
        activeReps: [
          active({ id: "r1", name: "Ann" }),
          active({ id: "r2", name: "Bob" }),
        ],
        eodDays: [
          eod({ repId: "r1", dayKey: "2026-08-23" }), // inside 3-day window
          eod({ repId: "r2", dayKey: "2026-08-18" }), // outside it
        ],
      }),
    );
    expect(model.eodWeek).toEqual({ submitted: 1, total: 2, missing: ["Bob"] });
  });
});
