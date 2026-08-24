import { describe, expect, it } from "vitest";

import {
  type RepQuotaSnapshot,
  answerBehindPace,
  answerCloseRate,
  answerMissedEod,
  answerMomentum,
  answerNetThisMonth,
  answerPayoutOwed,
  answerRepEarnings,
  answerRepPacing,
  answerRepQuotaGap,
  answerRepStreak,
  answerWhatsFailing,
  answerWhoOwes,
  fmtValue,
  plural,
  pct,
  usd,
} from "@/lib/ai/quick-answers";

const moneyQuota: RepQuotaSnapshot = {
  metricLabel: "Cash collected",
  isMoney: true,
  actualSoFar: 500_00,
  targetAmount: 1_000_00,
  status: "behind",
  remaining: 500_00,
  attainmentPct: 0.5,
  elapsedFraction: 0.75,
};

const hitQuota: RepQuotaSnapshot = {
  metricLabel: "Dials",
  isMoney: false,
  actualSoFar: 120,
  targetAmount: 100,
  status: "ahead",
  remaining: 0,
  attainmentPct: 1.2,
  elapsedFraction: 0.5,
};

describe("quick-answer formatters", () => {
  it("usd rounds to whole cents and groups", () => {
    expect(usd(1_234_56)).toBe("$1,234.56");
    expect(usd(0)).toBe("$0.00");
    expect(usd(99.6)).toBe("$1.00");
  });

  it("fmtValue switches on the metric unit", () => {
    expect(fmtValue(true, 250_00)).toBe("$250.00");
    expect(fmtValue(false, 1500)).toBe("1,500");
  });

  it("pct is a whole percent, plural is singular-aware", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(1.2)).toBe("120%");
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(2, "day")).toBe("2 days");
  });
});

describe("rep answers", () => {
  it("pacing: no quota, behind with remaining, and target hit", () => {
    expect(answerRepPacing({ repName: "Sam", quota: null }).headline).toContain(
      "No active quota",
    );

    const behind = answerRepPacing({ repName: "Sam", quota: moneyQuota });
    expect(behind.headline).toContain("behind pace");
    expect(behind.details[0]).toContain("$500.00 of $1,000.00");
    expect(behind.details[2]).toContain("still to go");

    const hit = answerRepPacing({ repName: "Sam", quota: hitQuota });
    expect(hit.headline).toContain("ahead of pace");
    expect(hit.details[2]).toContain("already hit");
  });

  it("streak: no activity, active streak, and reset", () => {
    expect(
      answerRepStreak({ repName: "Sam", current: 0, longest: 0, hasActivity: false })
        .headline,
    ).toContain("No activity");

    const active = answerRepStreak({
      repName: "Sam",
      current: 1,
      longest: 9,
      hasActivity: true,
    });
    expect(active.headline).toContain("1 day streak");
    expect(active.details[0]).toContain("9 days");
    expect(active.details[1]).toContain("keep it alive");

    const reset = answerRepStreak({
      repName: "Sam",
      current: 0,
      longest: 5,
      hasActivity: true,
    });
    expect(reset.headline).toContain("reset");
    expect(reset.details[1]).toContain("start a new one");
  });

  it("earnings: nothing on the books vs owed", () => {
    expect(
      answerRepEarnings({ repName: "Sam", owedCents: 0, dealCount: 0, hasLine: false })
        .headline,
    ).toContain("No commission");

    const owed = answerRepEarnings({
      repName: "Sam",
      owedCents: 250_00,
      dealCount: 1,
      hasLine: true,
    });
    expect(owed.headline).toContain("$250.00");
    expect(owed.details[0]).toContain("1 closed deal");
  });

  it("quota gap: none, already hit, and remaining", () => {
    expect(answerRepQuotaGap({ repName: "Sam", quota: null }).headline).toContain(
      "No quota",
    );
    expect(answerRepQuotaGap({ repName: "Sam", quota: hitQuota }).headline).toContain(
      "already hit",
    );
    const gap = answerRepQuotaGap({ repName: "Sam", quota: moneyQuota });
    expect(gap.headline).toContain("$500.00 left");
    expect(gap.details[0]).toContain("25% of the period left");
  });
});

describe("manager answers", () => {
  it("behind pace: no quotas, all on pace, and some behind", () => {
    expect(answerBehindPace([]).headline).toContain("No quotas");

    const clean = answerBehindPace([
      {
        label: "A",
        metricLabel: "Dials",
        status: "ahead",
        remaining: 0,
        isMoney: false,
      },
    ]);
    expect(clean.headline).toContain("Nobody's behind");

    const behind = answerBehindPace([
      {
        label: "Ana",
        metricLabel: "Cash collected",
        status: "behind",
        remaining: 300_00,
        isMoney: true,
      },
      {
        label: "Bo",
        metricLabel: "Dials",
        status: "on_track",
        remaining: 10,
        isMoney: false,
      },
    ]);
    expect(behind.headline).toBe("1 quota behind pace.");
    expect(behind.details[0]).toContain("Ana: $300.00 short");
  });

  it("missed eod: no reps, none filed, all filed, and some missing", () => {
    expect(
      answerMissedEod({ asOfLabel: null, missing: [], submitted: 0, total: 0 })
        .headline,
    ).toContain("No active reps");

    const noneFiledOne = answerMissedEod({
      asOfLabel: null,
      missing: [],
      submitted: 0,
      total: 1,
    });
    expect(noneFiledOne.headline).toContain("No EODs have been filed");
    expect(noneFiledOne.details[0]).toBe("1 active rep on the board.");

    // total > 1 with nothing filed exercises the plural "reps" branch.
    expect(
      answerMissedEod({ asOfLabel: null, missing: [], submitted: 0, total: 2 })
        .details[0],
    ).toBe("2 active reps on the board.");

    expect(
      answerMissedEod({
        asOfLabel: "2026-08-24",
        missing: [],
        submitted: 3,
        total: 3,
      }).headline,
    ).toContain("All 3 filed");

    const many = answerMissedEod({
      asOfLabel: "2026-08-24",
      missing: ["a", "b", "c", "d", "e", "f", "g"],
      submitted: 1,
      total: 8,
    });
    expect(many.headline).toContain("7 reps missed EOD");
    expect(many.details[0]).toContain("…");
    expect(many.details[1]).toBe("1/8 filed.");

    const few = answerMissedEod({
      asOfLabel: "2026-08-24",
      missing: ["a"],
      submitted: 2,
      total: 3,
    });
    expect(few.headline).toContain("1 rep missed EOD");
    expect(few.details[0]).toBe("a");
  });

  it("close rate: no shows vs a real rate", () => {
    expect(answerCloseRate({ pct: null, shows: 0, deals: 0 }).headline).toContain(
      "No shows",
    );
    const rate = answerCloseRate({ pct: 20, shows: 10, deals: 2 });
    expect(rate.headline).toBe("Close rate is 20%.");
    expect(rate.details[0]).toBe("2 deals from 10 shows.");
  });

  it("momentum: empty, nobody active, and some on a streak", () => {
    expect(answerMomentum([]).headline).toContain("No rep momentum");
    expect(
      answerMomentum([{ name: "A", currentStreak: 0, longestStreak: 4 }]).headline,
    ).toContain("Nobody's on an active streak");
    const hot = answerMomentum([
      { name: "Ana", currentStreak: 3, longestStreak: 5 },
      { name: "Bo", currentStreak: 0, longestStreak: 2 },
    ]);
    expect(hot.headline).toBe("1 rep on an active streak.");
    expect(hot.details[0]).toBe("Ana: 3 days (best 5).");
  });
});

describe("admin answers", () => {
  it("net this month: zero vs a figure", () => {
    expect(
      answerNetThisMonth({ cents: 0, monthLabel: "August 2026" }).details[0],
    ).toContain("Nothing recorded");
    const net = answerNetThisMonth({ cents: 1_000_00, monthLabel: "August 2026" });
    expect(net.headline).toBe("$1,000.00 collected in August 2026.");
    expect(net.details[0]).toContain("every offer");
  });

  it("what's failing: clean vs failures", () => {
    expect(answerWhatsFailing([]).headline).toContain("nothing failing");
    const fail = answerWhatsFailing([{ label: "Close CRM", note: "sync failed: 401" }]);
    expect(fail.headline).toBe("1 connection failing.");
    expect(fail.details[0]).toBe("Close CRM: sync failed: 401");
  });

  it("who owes: nothing vs outstanding", () => {
    expect(answerWhoOwes({ rows: [], totalArCents: 0 }).headline).toContain(
      "Nothing outstanding",
    );
    const owed = answerWhoOwes({
      rows: [{ client: "Grid", arCents: 500_00 }],
      totalArCents: 500_00,
    });
    expect(owed.headline).toContain("$500.00 outstanding across 1 deal");
    expect(owed.details[0]).toBe("Grid: $500.00.");
  });

  it("payout owed: nothing, all-zero, and real owed", () => {
    expect(answerPayoutOwed({ reps: [], totalOwedCents: 0 }).headline).toContain(
      "Nothing owed",
    );
    expect(
      answerPayoutOwed({
        reps: [{ name: "A", owedCents: 0 }],
        totalOwedCents: 0,
      }).headline,
    ).toContain("Nothing owed");
    const owed = answerPayoutOwed({
      reps: [
        { name: "Ana", owedCents: 300_00 },
        { name: "Bo", owedCents: 0 },
      ],
      totalOwedCents: 300_00,
    });
    expect(owed.headline).toBe("$300.00 owed across 1 rep.");
    expect(owed.details[0]).toBe("Ana: $300.00.");
  });
});
