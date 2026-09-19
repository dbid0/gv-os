import { describe, expect, it } from "vitest";

import {
  closePullWindow,
  FULL_SWEEP_EVERY_MS,
  OVERLAP_MS,
  readFullSweepAt,
  WINDOW_DAYS,
} from "@/lib/crm/close-window";

const NOW = new Date("2026-09-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const FULL_SINCE = ago(WINDOW_DAYS * DAY);

describe("closePullWindow", () => {
  it("reads only what is new since the last pull, with an overlap", () => {
    const w = closePullWindow(NOW, ago(2 * MIN), ago(1 * 60 * MIN));
    expect(w.full).toBe(false);
    expect(w.since).toEqual(ago(2 * MIN + OVERLAP_MS));
  });

  it("reads the whole window when there has never been a successful pull", () => {
    expect(closePullWindow(NOW, null, null)).toEqual({ since: FULL_SINCE, full: true });
  });

  it("reads the whole window when a full sweep has never run", () => {
    // A connection upgraded from the old pull has a lastSyncAt but no sweep
    // record — it gets one full pass first.
    expect(closePullWindow(NOW, ago(2 * MIN), null)).toEqual({
      since: FULL_SINCE,
      full: true,
    });
  });

  it("sweeps again once the sweep interval has passed", () => {
    const w = closePullWindow(NOW, ago(2 * MIN), ago(FULL_SWEEP_EVERY_MS));
    expect(w).toEqual({ since: FULL_SINCE, full: true });
  });

  it("does not sweep just before the interval is up", () => {
    const w = closePullWindow(NOW, ago(2 * MIN), ago(FULL_SWEEP_EVERY_MS - MIN));
    expect(w.full).toBe(false);
  });

  it("never reaches further back than the full window after a long outage", () => {
    // A week offline, sweep recent: the pass is the full window, not more.
    const w = closePullWindow(NOW, ago(WINDOW_DAYS * DAY + DAY), ago(MIN));
    expect(w).toEqual({ since: FULL_SINCE, full: true });
  });
});

describe("readFullSweepAt", () => {
  it("reads a stored timestamp", () => {
    expect(readFullSweepAt({ closeFullSweepAt: "2026-09-19T06:00:00.000Z" })).toEqual(
      new Date("2026-09-19T06:00:00.000Z"),
    );
  });

  it("reads anything unusable as never", () => {
    for (const config of [
      null,
      undefined,
      "text",
      {},
      { closeFullSweepAt: 12 },
      { closeFullSweepAt: "not a date" },
    ]) {
      expect(readFullSweepAt(config)).toBeNull();
    }
  });
});
