import { describe, expect, it } from "vitest";

import { snapshotsToPrune, SNAPSHOTS_KEPT } from "@/lib/tracking/retention";

const snaps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));

describe("snapshotsToPrune", () => {
  it("NEVER prunes the current snapshot", () => {
    // The head of the list is what every read uses; losing it blanks the offer.
    for (let n = 1; n <= 12; n += 1) {
      expect(snapshotsToPrune(snaps(n))).not.toContain("s0");
    }
  });

  it("keeps a few for comparison and drops the rest", () => {
    expect(snapshotsToPrune(snaps(8))).toEqual(["s5", "s6", "s7"]);
    expect(snapshotsToPrune(snaps(8))).toHaveLength(8 - SNAPSHOTS_KEPT);
  });

  it("prunes nothing while under the limit", () => {
    expect(snapshotsToPrune(snaps(3))).toEqual([]);
    expect(snapshotsToPrune(snaps(SNAPSHOTS_KEPT))).toEqual([]);
    expect(snapshotsToPrune([])).toEqual([]);
  });

  it("honours a custom keep count", () => {
    expect(snapshotsToPrune(snaps(4), 1)).toEqual(["s1", "s2", "s3"]);
  });

  it("refuses to keep zero rather than deleting everything", () => {
    expect(() => snapshotsToPrune(snaps(3), 0)).toThrow(/never prune/i);
  });
});
