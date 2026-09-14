import { describe, expect, it } from "vitest";

import { snapshotFreshness, SNAPSHOT_STALE_AFTER_MS } from "@/lib/tracking/freshness";

const NOW = new Date("2026-09-13T15:00:00Z");

describe("snapshotFreshness", () => {
  it("a snapshot inside the cadence window is fresh", () => {
    const synced = new Date(NOW.getTime() - 20 * 60 * 1000); // 20m ago
    const f = snapshotFreshness(synced, NOW);
    expect(f.state).toBe("fresh");
    expect(f.ageLabel).toBe("20m ago");
  });

  it("a snapshot older than the threshold triggers the STALE badge state", () => {
    const synced = new Date(NOW.getTime() - SNAPSHOT_STALE_AFTER_MS - 60_000);
    const f = snapshotFreshness(synced, NOW);
    // This is exactly the state the FeedFreshness badge renders as a warning.
    expect(f.state).toBe("stale");
    expect(f.ageMs).toBeGreaterThan(SNAPSHOT_STALE_AFTER_MS);
    expect(f.ageLabel).not.toBeNull();
  });

  it("exactly at the threshold is not yet stale", () => {
    const synced = new Date(NOW.getTime() - SNAPSHOT_STALE_AFTER_MS);
    expect(snapshotFreshness(synced, NOW).state).toBe("fresh");
  });

  it("never-synced is an honest 'never', never a fake fresh state", () => {
    expect(snapshotFreshness(null, NOW)).toEqual({
      state: "never",
      ageMs: null,
      ageLabel: null,
    });
    expect(snapshotFreshness(undefined, NOW).state).toBe("never");
  });

  it("a bad timestamp is 'never', not a crash or a fake age", () => {
    expect(snapshotFreshness("not a date", NOW).state).toBe("never");
  });

  it("accepts the serialized ISO-string shape a snapshot date takes over RSC", () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    const f = snapshotFreshness(iso, NOW);
    expect(f.state).toBe("stale"); // 3h > 90m
    expect(f.ageLabel).toBe("3h ago");
  });

  it("labels sub-minute ages as 'just now' and multi-day ages in days", () => {
    expect(snapshotFreshness(new Date(NOW.getTime() - 10_000), NOW).ageLabel).toBe(
      "just now",
    );
    expect(
      snapshotFreshness(new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000), NOW)
        .ageLabel,
    ).toBe("2d ago");
  });
});
