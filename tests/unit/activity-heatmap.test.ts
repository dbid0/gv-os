import { describe, expect, it } from "vitest";

import { buildActivityHeatmap, dayOfWeek, shiftDay } from "@/lib/activity-heatmap";

describe("day helpers", () => {
  it("computes day-of-week with no timezone drift", () => {
    expect(dayOfWeek("2026-08-23")).toBe(0); // Sunday
    expect(dayOfWeek("2026-08-24")).toBe(1); // Monday
    expect(dayOfWeek("2026-08-29")).toBe(6); // Saturday
  });

  it("shifts day keys across month and year boundaries", () => {
    expect(shiftDay("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-08-10", 7)).toBe("2026-08-17");
  });
});

describe("buildActivityHeatmap", () => {
  const today = "2026-08-24"; // a Monday

  it("lays out `weeks` columns of 7 rows, aligned to Sunday", () => {
    const m = buildActivityHeatmap([], today, 4);
    expect(m.columns).toHaveLength(4);
    expect(m.columns.every((c) => c.length === 7)).toBe(true);
    // The very first cell is the Sunday of the earliest visible week.
    expect(m.columns[0][0]?.day).toBe(shiftDay(today, -1 - 3 * 7)); // Sun, 3 weeks back
    expect(dayOfWeek(m.columns[0][0]!.day)).toBe(0);
  });

  it("nulls out days after today so the grid never implies the future", () => {
    const m = buildActivityHeatmap([], today, 4);
    const lastWeek = m.columns[3];
    // today is Monday (row 1): Sun+Mon present, Tue..Sat are future -> null.
    expect(lastWeek[0]).not.toBeNull(); // Sunday
    expect(lastWeek[1]?.day).toBe(today); // Monday = today
    expect(lastWeek.slice(2).every((c) => c === null)).toBe(true);
  });

  it("buckets values by day and scales intensity 0-4 off the max", () => {
    const m = buildActivityHeatmap(
      [
        { day: today, value: 100 }, // max -> level 4
        { day: shiftDay(today, -7), value: 20 }, // 20% -> level 1
        { day: shiftDay(today, -14), value: 60 }, // 60% -> level 3
      ],
      today,
      4,
    );
    expect(m.max).toBe(100);
    expect(m.total).toBe(180);
    const cellOn = (day: string) =>
      m.columns.flat().find((c) => c?.day === day) ?? null;
    expect(cellOn(today)!.level).toBe(4);
    expect(cellOn(shiftDay(today, -7))!.level).toBe(1);
    expect(cellOn(shiftDay(today, -14))!.level).toBe(3);
    // A day with no value is level 0.
    expect(cellOn(shiftDay(today, -1))!.level).toBe(0);
  });

  it("sums duplicate day entries before scaling", () => {
    const m = buildActivityHeatmap(
      [
        { day: today, value: 30 },
        { day: today, value: 70 },
      ],
      today,
      2,
    );
    const cell = m.columns.flat().find((c) => c?.day === today)!;
    expect(cell.value).toBe(100);
  });

  it("labels the first column of each month", () => {
    const m = buildActivityHeatmap([], today, 8);
    expect(m.monthLabels.length).toBeGreaterThan(0);
    expect(m.monthLabels.some((l) => l.label === "Aug")).toBe(true);
  });
});
