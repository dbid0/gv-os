import { describe, expect, it } from "vitest";

import {
  type DayMetrics,
  computeHeatmap,
  computePersonalBests,
  computeRepGamification,
  computeStreak,
  DEFAULT_HEATMAP_WEEKS,
  formatDayKey,
  PB_METRICS,
  shiftDayKey,
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  weekdayOf,
} from "@/lib/gamification/engine";

// 2026-08-23 is a Sunday, which keeps the heatmap window arithmetic obvious.
const TODAY = "2026-08-23";

describe("day-key math", () => {
  it("shifts calendar days without tripping over month or timezone edges", () => {
    expect(shiftDayKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDayKey(TODAY, 0)).toBe(TODAY);
  });

  it("reads the weekday, 0 = Sunday", () => {
    expect(weekdayOf("2026-08-23")).toBe(0); // Sunday
    expect(weekdayOf("2026-08-20")).toBe(4); // Thursday
    expect(weekdayOf("2026-08-22")).toBe(6); // Saturday
  });

  it("formats a day key compactly", () => {
    expect(formatDayKey("2026-08-22")).toBe("Aug 22");
    expect(formatDayKey("2026-12-01")).toBe("Dec 1");
  });

  it("exposes both label vocabularies, aligned to weekday index", () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_FULL[0]).toBe("Sunday");
    expect(WEEKDAY_FULL[6]).toBe("Saturday");
  });
});

describe("computeStreak", () => {
  it("returns a zero streak for a rep with no activity", () => {
    expect(computeStreak([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      lastActiveDay: null,
    });
  });

  it("counts a run ending today, and the longest run through a gap", () => {
    const days = [
      shiftDayKey(TODAY, -6), // isolated, breaks the run before it
      shiftDayKey(TODAY, -2),
      shiftDayKey(TODAY, -1),
      TODAY,
      TODAY, // duplicate proves the set de-dupes
    ];
    const s = computeStreak(days, TODAY);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.lastActiveDay).toBe(TODAY);
  });

  it("keeps the streak current when the last active day was yesterday", () => {
    const s = computeStreak([shiftDayKey(TODAY, -1)], TODAY);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.lastActiveDay).toBe(shiftDayKey(TODAY, -1));
  });

  it("breaks the current streak once two or more days are missed", () => {
    const days = [shiftDayKey(TODAY, -4), shiftDayKey(TODAY, -3)];
    const s = computeStreak(days, TODAY);
    expect(s.current).toBe(0); // last active day is 3 days ago
    expect(s.longest).toBe(2);
    expect(s.lastActiveDay).toBe(shiftDayKey(TODAY, -3));
  });
});

describe("computePersonalBests", () => {
  const days: DayMetrics[] = [
    { dayKey: "2026-08-10", metrics: { dials: 100, cash: 500_000, deals_closed: 0 } },
    { dayKey: "2026-08-11", metrics: { dials: 100, cash: 200_000 } }, // dials ties, cash lower
    { dayKey: "2026-08-12", metrics: { dials: 40, cash: 900_000, sets_booked: 3 } },
  ];

  it("records each metric's best single day, keeping the earliest on a tie", () => {
    const pbs = computePersonalBests(days);
    // Only metrics that had a positive day get a record, in PB_METRICS order.
    expect(pbs.map((p) => p.key)).toEqual(["cash", "dials", "sets_booked"]);

    const cash = pbs.find((p) => p.key === "cash");
    expect(cash).toMatchObject({
      value: 900_000,
      dayKey: "2026-08-12",
      format: "currency",
    });

    const dials = pbs.find((p) => p.key === "dials");
    // 100 on the 10th and the 11th tie — the earlier day keeps it.
    expect(dials).toMatchObject({ value: 100, dayKey: "2026-08-10" });

    const sets = pbs.find((p) => p.key === "sets_booked");
    expect(sets).toMatchObject({ value: 3, dayKey: "2026-08-12" });
  });

  it("emits nothing when no day is positive", () => {
    expect(
      computePersonalBests([
        { dayKey: "2026-08-10", metrics: { dials: 0 } },
        { dayKey: "2026-08-11", metrics: {} },
      ]),
    ).toEqual([]);
  });

  it("accepts a custom metric set", () => {
    const pbs = computePersonalBests(days, [
      { key: "dials", label: "Dials", format: "number" },
    ]);
    expect(pbs).toHaveLength(1);
    expect(pbs[0].key).toBe("dials");
  });

  it("ships the default record book", () => {
    expect(PB_METRICS.map((m) => m.key)).toContain("cash");
    expect(PB_METRICS.find((m) => m.key === "cash")?.format).toBe("currency");
  });
});

describe("computeHeatmap", () => {
  it("builds a Sunday→Saturday grid, scales levels, and names the best weekday", () => {
    const d1 = shiftDayKey(TODAY, -1); // Sat
    const d3 = shiftDayKey(TODAY, -3); // Thu
    const d10 = shiftDayKey(TODAY, -10); // Thu, one week earlier
    const hm = computeHeatmap(
      [
        { dayKey: d3, value: 5 },
        { dayKey: d3, value: 5 }, // same day accumulates to 10
        { dayKey: d10, value: 2 },
        { dayKey: d1, value: 2 },
      ],
      4,
      TODAY,
    );

    expect(hm.weeks).toHaveLength(4);
    for (const week of hm.weeks) expect(week).toHaveLength(7);
    expect(hm.max).toBe(10);
    expect(hm.total).toBe(14);

    // Thursday carries the most (10 + 2 across two weeks).
    expect(hm.bestWeekday).toBe(4);
    expect(hm.bestWeekdayLabel).toBe("Thursday");
    expect(hm.weekdayTotals[4]).toBe(12);

    const flat = hm.weeks.flat();
    expect(flat.find((c) => c.dayKey === d3)?.level).toBe(4); // the busiest day
    expect(flat.find((c) => c.dayKey === d1)?.level).toBe(1); // ceil(0.8)
    // A day with no activity is an empty cell, not a phantom one.
    expect(flat.find((c) => c.dayKey === shiftDayKey(TODAY, -5))?.level).toBe(0);
  });

  it("has no best weekday when there is no activity at all", () => {
    const hm = computeHeatmap([], 2, TODAY);
    expect(hm.weeks).toHaveLength(2);
    expect(hm.max).toBe(0);
    expect(hm.total).toBe(0);
    expect(hm.bestWeekday).toBeNull();
    expect(hm.bestWeekdayLabel).toBeNull();
    expect(hm.weeks.flat().every((c) => c.level === 0)).toBe(true);
  });
});

describe("computeRepGamification", () => {
  it("combines all three signals with explicit options", () => {
    const g = computeRepGamification({
      todayKey: TODAY,
      activeDayKeys: [shiftDayKey(TODAY, -1), TODAY],
      dayMetrics: [{ dayKey: TODAY, metrics: { dials: 50 } }],
      dailyActivity: [{ dayKey: TODAY, value: 50 }],
      heatmapWeeks: 3,
      pbMetrics: [{ key: "dials", label: "Dials", format: "number" }],
    });
    expect(g.hasActivity).toBe(true);
    expect(g.streak.current).toBe(2);
    expect(g.personalBests).toHaveLength(1);
    expect(g.heatmap.weeks).toHaveLength(3);
  });

  it("defaults the window and record book, and reports an honest empty state", () => {
    const g = computeRepGamification({
      todayKey: TODAY,
      activeDayKeys: [],
      dayMetrics: [],
      dailyActivity: [],
    });
    expect(g.hasActivity).toBe(false);
    expect(g.streak.current).toBe(0);
    expect(g.personalBests).toEqual([]);
    expect(g.heatmap.weeks).toHaveLength(DEFAULT_HEATMAP_WEEKS);
  });
});
