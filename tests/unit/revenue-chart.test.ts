import { describe, expect, it } from "vitest";

import {
  buildRevenueChartModel,
  compactUsd,
  niceCeil,
  shortDate,
} from "@/lib/revenue-chart";

describe("niceCeil", () => {
  it("rounds up to a nice 1/2/2.5/5 x 10^n ceiling", () => {
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(1_400)).toBe(2_000);
    expect(niceCeil(2_100)).toBe(2_500);
    expect(niceCeil(4_800)).toBe(5_000);
    expect(niceCeil(9_900)).toBe(10_000);
    expect(niceCeil(23_000)).toBe(25_000);
  });
});

describe("compactUsd", () => {
  it("renders whole-dollar compact money from cents", () => {
    expect(compactUsd(0)).toBe("$0");
    expect(compactUsd(50_000)).toBe("$500");
    expect(compactUsd(250_000)).toBe("$2.5k");
    expect(compactUsd(1_000_000)).toBe("$10k");
    expect(compactUsd(120_000_000)).toBe("$1.2M");
  });
});

describe("shortDate", () => {
  it("formats a day key without timezone drift", () => {
    expect(shortDate("2026-08-04")).toBe("Aug 4");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
    expect(shortDate("garbage")).toBe("garbage");
  });
});

describe("buildRevenueChartModel", () => {
  const series = [
    { day: "2026-08-01", cents: 100_000 },
    { day: "2026-08-02", cents: 0 },
    { day: "2026-08-03", cents: 500_000 },
    { day: "2026-08-04", cents: 250_000 },
  ];

  it("returns null below two points — a single dot is not a trend", () => {
    expect(buildRevenueChartModel([])).toBeNull();
    expect(buildRevenueChartModel([{ day: "2026-08-01", cents: 1 }])).toBeNull();
  });

  it("scales points into the plot with a nice y-max and axis ticks", () => {
    const m = buildRevenueChartModel(series, { width: 760, height: 260 })!;
    expect(m.niceMax).toBe(500_000); // max is exactly $5,000
    expect(m.points).toHaveLength(4);
    // The peak sits at the top of the plot; a zero day sits on the baseline.
    const peak = m.points[2];
    const zero = m.points[1];
    expect(peak.y).toBeLessThan(zero.y);
    expect(zero.y).toBeCloseTo(m.baselineY, 5);
    // First and last x pin to the plot edges.
    expect(m.points[0].x).toBeLessThan(m.points[3].x);
    // y-axis labels run 0 -> max.
    expect(m.yTicks[0].label).toBe("$0");
    expect(m.yTicks[m.yTicks.length - 1].label).toBe("$5k");
    // x-axis labels are dated.
    expect(m.xTicks[0].label).toBe("Aug 1");
  });

  it("draws an area path that closes back to the baseline", () => {
    const m = buildRevenueChartModel(series)!;
    expect(m.areaPath.startsWith("M")).toBe(true);
    expect(m.areaPath.trimEnd().endsWith("Z")).toBe(true);
    expect(m.linePath.startsWith("M")).toBe(true);
  });

  it("survives an all-zero series without dividing by zero", () => {
    const flat = [
      { day: "2026-08-01", cents: 0 },
      { day: "2026-08-02", cents: 0 },
    ];
    const m = buildRevenueChartModel(flat)!;
    expect(m.niceMax).toBe(1);
    expect(m.points.every((p) => p.y === m.baselineY)).toBe(true);
  });
});
