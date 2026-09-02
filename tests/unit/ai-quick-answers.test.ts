import { describe, expect, it } from "vitest";

import {
  type ClientTrendDeal,
  type RepQuotaSnapshot,
  answerBehindPace,
  answerClientTrend,
  answerCloseRate,
  answerMissedEod,
  answerMomentum,
  answerNetThisMonth,
  answerPayoutOwed,
  answerRepBestDay,
  answerRepConversion,
  answerRepEarnings,
  answerRepPacing,
  answerRepQuotaGap,
  answerRepStreak,
  answerTeamStandings,
  answerWhatsFailing,
  answerWhoOwes,
  bucketClientTrend,
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

  it("conversion: no calls, unresolved, show-only, and a close rate", () => {
    expect(
      answerRepConversion({
        repName: "Sam",
        showRate: null,
        closeRate: null,
        shows: 0,
        sales: 0,
        calls: 0,
        hasCalls: false,
      }).headline,
    ).toContain("No calls logged");

    // Calls logged but nothing resolved either way: no rates yet.
    const unresolved = answerRepConversion({
      repName: "Sam",
      showRate: null,
      closeRate: null,
      shows: 0,
      sales: 0,
      calls: 4,
      hasCalls: true,
    });
    expect(unresolved.headline).toContain("no outcomes resolved yet");
    expect(unresolved.details).toEqual(["4 calls logged so far."]);

    // Shows resolved, but no one closed yet: show rate leads, no close line.
    const showOnly = answerRepConversion({
      repName: "Sam",
      showRate: 0.5,
      closeRate: null,
      shows: 0,
      sales: 0,
      calls: 6,
      hasCalls: true,
    });
    expect(showOnly.headline).toBe("Your show rate is 50%, Sam.");
    expect(showOnly.details[0]).toBe("Show rate: 50%.");
    expect(showOnly.details.some((d) => d.startsWith("Close rate"))).toBe(false);

    // A real close rate: it leads, and the supporting line spells it out.
    const closed = answerRepConversion({
      repName: "Sam",
      showRate: 0.8,
      closeRate: 0.25,
      shows: 4,
      sales: 1,
      calls: 10,
      hasCalls: true,
    });
    expect(closed.headline).toBe("Your close rate is 25%, Sam.");
    expect(closed.details[0]).toBe("Show rate: 80%.");
    expect(closed.details[1]).toBe("Close rate: 25% — 1 sale from 4 shows.");
    expect(closed.details[2]).toBe("10 calls logged so far.");
  });

  it("best day: no activity, weekday + record, and active with no record", () => {
    expect(
      answerRepBestDay({
        repName: "Sam",
        bestWeekdayLabel: null,
        topRecordLabel: null,
        topRecordDisplay: null,
        hasActivity: false,
      }).headline,
    ).toContain("No activity logged");

    const full = answerRepBestDay({
      repName: "Sam",
      bestWeekdayLabel: "Wednesday",
      topRecordLabel: "Best cash day",
      topRecordDisplay: "$2,000.00",
      hasActivity: true,
    });
    expect(full.headline).toBe("Wednesday is your strongest day, Sam.");
    expect(full.details[0]).toBe("Best cash day: $2,000.00.");

    // Active inside the window but no weekday winner and no record yet.
    const bare = answerRepBestDay({
      repName: "Sam",
      bestWeekdayLabel: null,
      topRecordLabel: null,
      topRecordDisplay: null,
      hasActivity: true,
    });
    expect(bare.headline).toBe("You're logging activity, Sam.");
    expect(bare.details[0]).toContain("set your first personal record");
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

  it("standings: no reps, one rep, and a top + bottom", () => {
    expect(
      answerTeamStandings({ top: null, bottom: null, activeCount: 0 }).headline,
    ).toContain("No active reps");

    // A non-null activeCount but no ranked rep still lands on the empty state.
    expect(
      answerTeamStandings({ top: null, bottom: null, activeCount: 3 }).headline,
    ).toContain("No active reps");

    const solo = answerTeamStandings({
      top: { name: "Ana", cashCents: 500_00, deals: 2 },
      bottom: null,
      activeCount: 1,
    });
    expect(solo.headline).toBe("Ana leads with $500.00.");
    expect(solo.details[0]).toBe("2 deals closed by Ana.");
    expect(solo.details[1]).toContain("Only one rep");

    const both = answerTeamStandings({
      top: { name: "Ana", cashCents: 900_00, deals: 3 },
      bottom: { name: "Bo", cashCents: 100_00, deals: 1 },
      activeCount: 2,
    });
    expect(both.headline).toBe("Ana leads with $900.00.");
    expect(both.details[0]).toBe("3 deals closed by Ana.");
    expect(both.details[1]).toBe("Bottom: Bo at $100.00.");
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

    // A real zero still reads as a zero.
    expect(answerNetThisMonth({ cents: 0, monthLabel: "August 2026" }).headline).toBe(
      "$0.00 collected in August 2026.",
    );
  });

  it("never reports UNKNOWN cash as $0", () => {
    // The sheet not having synced is not a claim that nothing was collected.
    const never = answerNetThisMonth({
      cents: null,
      monthLabel: "August 2026",
      reason: "never-synced",
    });
    expect(never.headline).not.toContain("$");
    expect(never.headline).toContain("can't read");
    expect(never.details[0]).toContain("hasn't synced");
    expect(never.details[0]).toContain("not zero");

    const broken = answerNetThisMonth({
      cents: null,
      monthLabel: "August 2026",
      reason: "unavailable",
    });
    expect(broken.headline).not.toContain("$");
    expect(broken.details[0]).toContain("couldn't be read");
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

  it("client trend: buckets by month per client and ranks by swing", () => {
    const deals: ClientTrendDeal[] = [
      { client: "Grid", monthKey: "2026-08", netCents: 700_00 },
      { client: "Grid", monthKey: "2026-07", netCents: 200_00 },
      { client: "Vault", monthKey: "2026-08", netCents: 100_00 },
      { client: "Vault", monthKey: "2026-07", netCents: 400_00 },
      { client: "Racks", monthKey: "2026-08", netCents: 300_00 },
      { client: "Racks", monthKey: "2026-07", netCents: 300_00 }, // flat
      // Outside the compared window — ignored entirely.
      { client: "Old", monthKey: "2026-05", netCents: 999_00 },
    ];
    const rows = bucketClientTrend(deals, "2026-08", "2026-07");
    expect(rows.map((r) => r.client)).toEqual(["Grid", "Vault", "Racks"]);
    expect(rows[0]).toMatchObject({
      client: "Grid",
      thisCents: 700_00,
      lastCents: 200_00,
      deltaCents: 500_00,
    });
    // Racks is flat, so its delta is exactly zero.
    expect(rows.find((r) => r.client === "Racks")?.deltaCents).toBe(0);
    // "Old" fell outside both months and never entered the roll-up.
    expect(rows.some((r) => r.client === "Old")).toBe(false);
  });

  it("client trend answer: empty state", () => {
    const empty = answerClientTrend({
      rows: [],
      thisLabel: "August 2026",
      lastLabel: "July 2026",
    });
    expect(empty.headline).toContain("No client cash to compare");
    expect(empty.details[0]).toContain("July 2026");
  });

  it("client trend answer: up, down, and flat all render a direction", () => {
    const ans = answerClientTrend({
      rows: [
        { client: "Grid", thisCents: 900_00, lastCents: 100_00, deltaCents: 800_00 },
        { client: "Vault", thisCents: 100_00, lastCents: 700_00, deltaCents: -600_00 },
        { client: "Racks", thisCents: 300_00, lastCents: 300_00, deltaCents: 0 },
      ],
      thisLabel: "August 2026",
      lastLabel: "July 2026",
    });
    expect(ans.headline).toBe("1 client up, 1 down vs July 2026.");
    expect(ans.details[0]).toBe("Grid: $900.00 this month (up $800.00).");
    expect(ans.details[1]).toBe("Vault: $100.00 this month (down $600.00).");
    expect(ans.details[2]).toBe("Racks: $300.00 this month (flat).");
  });

  it("client trend answer: caps the list at six lines", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      client: `C${i}`,
      thisCents: (i + 1) * 100_00,
      lastCents: 0,
      deltaCents: (i + 1) * 100_00,
    }));
    const ans = answerClientTrend({
      rows,
      thisLabel: "August 2026",
      lastLabel: "July 2026",
    });
    expect(ans.headline).toBe("9 clients up, 0 down vs July 2026.");
    expect(ans.details).toHaveLength(6);
  });
});
