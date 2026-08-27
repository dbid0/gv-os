import { describe, expect, it } from "vitest";

import {
  computeSpeedToLead,
  computeSpeedToLeadByClient,
  type SpeedToLeadApp,
  type SpeedToLeadCall,
  type SpeedToLeadClientApp,
  type SpeedToLeadClientCall,
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

const capp = (
  clientId: string | null,
  clientName: string | null,
  email: string | null,
  atMin: number,
): SpeedToLeadClientApp => ({
  clientId,
  clientName,
  email,
  submittedAtMs: T0 + min(atMin),
});
const ccall = (
  clientId: string | null,
  clientName: string | null,
  email: string | null,
  atMin: number,
): SpeedToLeadClientCall => ({
  clientId,
  clientName,
  email,
  occurredAtMs: T0 + min(atMin),
});

describe("computeSpeedToLeadByClient", () => {
  it("returns no rows when there are no applications", () => {
    expect(computeSpeedToLeadByClient([], [ccall("g", "Grid", "x@x.com", 0)])).toEqual(
      [],
    );
  });

  it("computes one row per offer, matched only within that offer", () => {
    const out = computeSpeedToLeadByClient(
      [
        capp("g", "Grid", "a@x.com", 0),
        capp("g", "Grid", "b@x.com", 0),
        capp("v", "Vault", "c@x.com", 0),
      ],
      [
        ccall("g", "Grid", "a@x.com", 3), // within 5m
        ccall("g", "Grid", "b@x.com", 90), // over 60m
        ccall("v", "Vault", "c@x.com", 10),
        // A Grid-emailed lead dialed under the Vault offer must NOT match Grid.
        ccall("v", "Vault", "a@x.com", 1),
      ],
    );
    expect(out.map((r) => r.clientName)).toEqual(["Grid", "Vault"]); // Grid has more matched
    const grid = out.find((r) => r.clientId === "g")!;
    expect(grid.dialableApps).toBe(2);
    expect(grid.matched).toBe(2);
    expect(grid.within5).toBe(1);
    expect(grid.over60).toBe(1);
    expect(grid.slaPct).toBeCloseTo(0.5);
    const vault = out.find((r) => r.clientId === "v")!;
    expect(vault.matched).toBe(1);
    expect(vault.medianMinutes).toBe(10);
  });

  it("drops applications with no offer", () => {
    const out = computeSpeedToLeadByClient(
      [capp(null, null, "a@x.com", 0), capp("g", "Grid", "b@x.com", 0)],
      [ccall("g", "Grid", "b@x.com", 2)],
    );
    expect(out).toHaveLength(1);
    expect(out[0].clientId).toBe("g");
  });

  it("buckets by normalized name when no client id is present", () => {
    const out = computeSpeedToLeadByClient(
      [capp(null, "The Grid", "a@x.com", 0)],
      [ccall(null, "the grid", "a@x.com", 4)],
    );
    expect(out).toHaveLength(1);
    expect(out[0].clientId).toBeNull();
    expect(out[0].clientName).toBe("The Grid");
    expect(out[0].matched).toBe(1);
    expect(out[0].within5).toBe(1);
  });

  it("orders by matched, then dialable, then name", () => {
    const out = computeSpeedToLeadByClient(
      [
        capp("a", "Alpha", "a1@x.com", 0),
        capp("b", "Bravo", "b1@x.com", 0),
        capp("b", "Bravo", "b2@x.com", 0),
      ],
      [ccall("a", "Alpha", "a1@x.com", 2), ccall("b", "Bravo", "b1@x.com", 2)],
    );
    // Both have 1 matched; Bravo has more dialable apps, so it ranks first.
    expect(out.map((r) => r.clientName)).toEqual(["Bravo", "Alpha"]);
  });
});
