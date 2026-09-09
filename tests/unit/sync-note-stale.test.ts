import { describe, expect, it } from "vitest";

import { isStaleSync, STALE_AFTER_MS } from "@/lib/integrations/sync-note";

const NOW = new Date("2026-09-09T15:00:00Z");

describe("isStaleSync", () => {
  it("fresh sync is not stale", () => {
    expect(isStaleSync(new Date("2026-09-09T14:50:00Z"), NOW)).toBe(false);
  });

  it("a sync older than the threshold is stale", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 60_000);
    expect(isStaleSync(old, NOW)).toBe(true);
  });

  it("exactly at the threshold is not yet stale", () => {
    expect(isStaleSync(new Date(NOW.getTime() - STALE_AFTER_MS), NOW)).toBe(false);
  });

  it("never-synced is pending, not stale", () => {
    expect(isStaleSync(null, NOW)).toBe(false);
    expect(isStaleSync(undefined, NOW)).toBe(false);
  });

  it("accepts ISO strings (the serialized row shape) and rejects garbage", () => {
    expect(isStaleSync("2026-09-09T05:00:00Z", NOW)).toBe(true);
    expect(isStaleSync("not a date", NOW)).toBe(false);
  });
});
