import { describe, expect, it } from "vitest";

import { agingTone, daysSinceClose } from "@/lib/accounting/aging";

// 8pm CT on Aug 22 = 01:00 UTC Aug 23 — the CT day must win.
const NOW = new Date("2026-08-23T01:00:00Z");

describe("daysSinceClose", () => {
  it("counts whole days against the CT business day, not the UTC day", () => {
    expect(daysSinceClose("2026-08-22", NOW)).toBe(0);
    expect(daysSinceClose("2026-08-21", NOW)).toBe(1);
    expect(daysSinceClose("2026-07-31", NOW)).toBe(22);
    expect(daysSinceClose("2026-07-17", NOW)).toBe(36);
  });

  it("spans month and DST boundaries without drift", () => {
    // US DST ended Nov 1 2026; a span crossing it must still be whole days.
    expect(daysSinceClose("2026-10-30", new Date("2026-11-03T18:00:00Z"))).toBe(4);
  });

  it("returns null on junk instead of a fake age", () => {
    expect(daysSinceClose("7/31/2026", NOW)).toBeNull();
    expect(daysSinceClose("", NOW)).toBeNull();
    expect(daysSinceClose("not a date", NOW)).toBeNull();
  });
});

describe("agingTone", () => {
  it("buckets by age with null as fresh", () => {
    expect(agingTone(0)).toBe("fresh");
    expect(agingTone(30)).toBe("fresh");
    expect(agingTone(31)).toBe("watch");
    expect(agingTone(60)).toBe("watch");
    expect(agingTone(61)).toBe("overdue");
    expect(agingTone(null)).toBe("fresh");
  });
});
