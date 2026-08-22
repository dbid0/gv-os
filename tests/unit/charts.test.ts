import { describe, expect, it } from "vitest";

import {
  bucketByDay,
  bucketByMonth,
  CHART_CATEGORICAL,
  chartColorForClient,
  dayKeyCT,
  latestPerDay,
} from "@/lib/charts";

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

describe("latestPerDay", () => {
  it("keeps the last sample per CT day, oldest day first", () => {
    const out = latestPerDay([
      { at: new Date("2026-08-22T11:11:00Z"), value: 330 }, // Aug 22 6:11am CT
      { at: new Date("2026-08-21T20:27:00Z"), value: 310 }, // Aug 21 3:27pm CT
      { at: new Date("2026-08-21T11:58:00Z"), value: 305 }, // Aug 21 earlier — superseded
    ]);
    expect(out).toEqual([
      { date: "2026-08-21", label: "Aug 21", value: 310 },
      { date: "2026-08-22", label: "Aug 22", value: 330 },
    ]);
  });

  it("assigns the CT day, not the UTC day, near midnight", () => {
    // 03:30 UTC Aug 22 = 10:30pm CT Aug 21.
    const out = latestPerDay([{ at: new Date("2026-08-22T03:30:00Z"), value: 5 }]);
    expect(out).toEqual([{ date: "2026-08-21", label: "Aug 21", value: 5 }]);
  });

  it("does not zero-fill missing days", () => {
    const out = latestPerDay([
      { at: new Date("2026-08-01T12:00:00Z"), value: 1 },
      { at: new Date("2026-08-10T12:00:00Z"), value: 9 },
    ]);
    expect(out.map((b) => b.date)).toEqual(["2026-08-01", "2026-08-10"]);
  });

  it("returns empty for no samples", () => {
    expect(latestPerDay([])).toEqual([]);
  });
});

describe("chartColorForClient", () => {
  it("maps each client to its fixed hue and defaults unknowns", () => {
    expect(chartColorForClient("The Grid")).toBe(CHART_CATEGORICAL[0]);
    expect(chartColorForClient("The Vault")).toBe(CHART_CATEGORICAL[1]);
    expect(chartColorForClient("Racks Closes")).toBe(CHART_CATEGORICAL[2]);
    expect(chartColorForClient(null)).toBe(CHART_CATEGORICAL[0]);
  });
});
