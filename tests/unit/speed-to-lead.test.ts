import { describe, expect, it } from "vitest";

import {
  computeSpeedToLead,
  type SpeedToLeadApp,
  type SpeedToLeadCall,
} from "@/lib/funnel/speed-to-lead";

const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms
const min = (n: number) => n * 60_000;

const app = (email: string | null, atMin: number): SpeedToLeadApp => ({
  email,
  submittedAtMs: T0 + min(atMin),
});
const call = (email: string | null, atMin: number): SpeedToLeadCall => ({
  email,
  occurredAtMs: T0 + min(atMin),
});

describe("computeSpeedToLead", () => {
  it("returns an all-zero, null-median shape when nothing matches", () => {
    const out = computeSpeedToLead([app("a@x.com", 0)], []);
    expect(out).toEqual({
      dialableApps: 1,
      matched: 0,
      medianMinutes: null,
      within5: 0,
      within20: 0,
      over60: 0,
      slaPct: null,
    });
  });

  it("measures minutes from application to the first dial", () => {
    const out = computeSpeedToLead([app("a@x.com", 0)], [call("a@x.com", 3)]);
    expect(out.matched).toBe(1);
    expect(out.medianMinutes).toBe(3);
    expect(out.within5).toBe(1);
    expect(out.slaPct).toBe(1);
  });

  it("buckets within 5 / 20 / over 60 minutes", () => {
    const out = computeSpeedToLead(
      [app("a@x.com", 0), app("b@x.com", 0), app("c@x.com", 0)],
      [call("a@x.com", 4), call("b@x.com", 18), call("c@x.com", 90)],
    );
    expect(out.matched).toBe(3);
    expect(out.within5).toBe(1);
    expect(out.within20).toBe(2); // 4 and 18 min both within 20
    expect(out.over60).toBe(1); // 90 min
    expect(out.slaPct).toBeCloseTo(1 / 3);
  });

  it("takes the earliest call per lead and matches emails case-insensitively", () => {
    const out = computeSpeedToLead(
      [app("Lead@X.com", 0)],
      [call("lead@x.com", 30), call("lead@x.com", 6)],
    );
    expect(out.medianMinutes).toBe(6);
  });

  it("ignores a call logged before the application", () => {
    const out = computeSpeedToLead([app("a@x.com", 10)], [call("a@x.com", 2)]);
    expect(out.matched).toBe(0);
  });

  it("excludes applications with no email from the dialable count", () => {
    const out = computeSpeedToLead(
      [app(null, 0), app("  ", 0), app("a@x.com", 0)],
      [call("a@x.com", 1)],
    );
    expect(out.dialableApps).toBe(1);
    expect(out.matched).toBe(1);
  });

  it("averages the two middle durations for an even sample", () => {
    const out = computeSpeedToLead(
      [app("a@x.com", 0), app("b@x.com", 0)],
      [call("a@x.com", 4), call("b@x.com", 8)],
    );
    expect(out.medianMinutes).toBe(6); // (4 + 8) / 2
  });
});
