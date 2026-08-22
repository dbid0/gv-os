import { describe, expect, it } from "vitest";

import {
  driftRule,
  signedDocRule,
  stalenessRule,
  syncFailureRule,
  type IntegrationState,
} from "@/lib/notifications/rules";

const NOW = new Date("2026-08-22T12:00:00Z");

const conn = (o: Partial<IntegrationState>): IntegrationState => ({
  id: "c1",
  provider: "kit",
  label: "Racks Closes Kit",
  clientId: "rc",
  lastSyncAt: new Date("2026-08-22T11:00:00Z"),
  lastSyncNote: "7 sequences, 0 tags",
  ...o,
});

describe("syncFailureRule", () => {
  it("alerts only on failure notes, keyed by connection + note", () => {
    const failing = conn({ lastSyncNote: "sync failed: Kit 401" });
    const out = syncFailureRule([conn({}), failing]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "sync_failure",
      severity: "critical",
      dedupeKey: "sync-failure:c1:sync failed: Kit 401",
    });
  });
});

describe("stalenessRule", () => {
  it("flags >26h silence once per day; never-synced stays quiet", () => {
    const stale = conn({ id: "s1", lastSyncAt: new Date("2026-08-21T05:00:00Z") });
    const fresh = conn({ id: "f1" });
    const never = conn({ id: "n1", lastSyncAt: null });
    const out = stalenessRule([stale, fresh, never], NOW, "2026-08-22");
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("stale:s1:2026-08-22");
    expect(out[0].severity).toBe("warning");
  });
});

describe("driftRule", () => {
  it("fires only above the 5-cent baseline, keyed per run", () => {
    expect(driftRule(null)).toEqual([]);
    expect(driftRule({ id: "r1", driftRowCount: 5, totalAbsDriftCents: 5 })).toEqual(
      [],
    );
    const out = driftRule({ id: "r2", driftRowCount: 6, totalAbsDriftCents: 105 });
    expect(out[0]).toMatchObject({
      kind: "sheet_drift",
      severity: "critical",
      dedupeKey: "drift:r2",
    });
    expect(out[0].title).toContain("$1.05");
  });
});

describe("signedDocRule", () => {
  it("one info per signed doc, keyed by the source id", () => {
    const out = signedDocRule([
      { externalId: "d1", name: "Grid Agreement", clientId: "g", completedAt: NOW },
      { externalId: "d2", name: null, clientId: null, completedAt: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].dedupeKey).toBe("signed:d1");
    expect(out[1].title).toBe("Agreement signed");
  });
});
