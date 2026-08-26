import { describe, expect, it } from "vitest";

import { monthPace } from "@/lib/brief/pace";

describe("monthPace", () => {
  it("projects to month-end at the current run-rate", () => {
    // $50k collected by day 15 of a 30-day month → on pace for ~$100k.
    const p = monthPace(5_000_000, 10_000_000, 15, 30);
    expect(p.projectedCents).toBe(10_000_000);
    expect(p.pct).toBe(50);
    expect(p.projectedPct).toBe(100);
    expect(p.onPaceCents).toBe(5_000_000);
    expect(p.status).toBe("ahead");
  });

  it("flags behind when the run-rate won't reach the goal", () => {
    // $20k by day 15 of 30 → projects $40k against a $100k goal.
    const p = monthPace(2_000_000, 10_000_000, 15, 30);
    expect(p.projectedPct).toBe(40);
    expect(p.status).toBe("behind");
  });

  it("reads on_track in the 85–99% projection band", () => {
    const p = monthPace(4_500_000, 10_000_000, 15, 30); // projects 90%
    expect(p.status).toBe("on_track");
  });

  it("returns a no_goal state when no goal is set", () => {
    const p = monthPace(3_000_000, 0, 10, 30);
    expect(p.status).toBe("no_goal");
    expect(p.pct).toBe(0);
    expect(p.projectedCents).toBe(9_000_000); // still projects the run-rate
  });

  it("does not divide by zero on day 0", () => {
    const p = monthPace(0, 10_000_000, 0, 30);
    expect(p.projectedCents).toBe(0);
    expect(p.status).toBe("behind");
  });
});
