import { describe, expect, it } from "vitest";

import { bucketByDay, bucketByMonth, CHART_CATEGORICAL, dayKeyCT } from "@/lib/charts";

const NOW = new Date("2026-08-21T20:00:00-05:00"); // evening CT

describe("bucketByDay", () => {
  it("zero-fills the window, oldest first, counting in CT business days", () => {
    const out = bucketByDay(
      [
        new Date("2026-08-21T10:00:00-05:00"),
        new Date("2026-08-21T23:00:00-05:00"),
        new Date("2026-08-19T09:00:00-05:00"),
        null,
      ],
      7,
      NOW,
    );
    expect(out).toHaveLength(7);
    expect(out[out.length - 1]).toMatchObject({ date: "2026-08-21", value: 2 });
    expect(out.find((b) => b.date === "2026-08-19")?.value).toBe(1);
    expect(out.filter((b) => b.value === 0)).toHaveLength(5);
    expect(out[0].date < out[6].date).toBe(true);
  });

  it("buckets by the CT day, not the UTC day", () => {
    // 01:30 UTC on Aug 22 is still Aug 21 in Chicago.
    const lateNight = new Date("2026-08-22T01:30:00Z");
    expect(dayKeyCT(lateNight)).toBe("2026-08-21");
    const out = bucketByDay([lateNight], 2, NOW);
    expect(out.find((b) => b.date === "2026-08-21")?.value).toBe(1);
  });
});

describe("bucketByMonth", () => {
  it("sums cents per calendar month, oldest first, no zero-fill", () => {
    const out = bucketByMonth([
      { date: "2026-05-23", cents: 297_571 },
      { date: "2026-07-01", cents: 300_000 },
      { date: "2026-07-17", cents: 194_171 },
      { date: "garbage", cents: 999 },
    ]);
    expect(out.map((b) => b.date)).toEqual(["2026-05", "2026-07"]);
    expect(out[1].value).toBe(494_171);
    expect(out[0].label).toMatch(/May/);
  });
});

describe("chart palette", () => {
  it("keeps the validated fixed-order trio (never the roster accents)", () => {
    expect(CHART_CATEGORICAL).toEqual(["#2f8ce8", "#bd7f16", "#bd68b8"]);
  });
});
