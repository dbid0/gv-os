import { describe, expect, it } from "vitest";

import {
  assertStagingUrl,
  parseEnvFile,
  ProdGuardError,
  PROD_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../../scripts/seed/guard";
import { Rng } from "../../scripts/seed/rng";
import {
  ANCHOR_DAY,
  buildSeedData,
  DEMO_EMAIL_DOMAIN,
  MARKER,
  SEED,
  shiftDay,
} from "../../scripts/seed/fixtures";

const STAGING_URL = `postgresql://postgres.${STAGING_PROJECT_REF}:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const PROD_URL = `postgresql://postgres.${PROD_PROJECT_REF}:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;

describe("prod guard — assertStagingUrl", () => {
  it("returns the url unchanged for a staging connection string", () => {
    expect(assertStagingUrl(STAGING_URL)).toBe(STAGING_URL);
  });

  it("throws on the production project ref", () => {
    expect(() => assertStagingUrl(PROD_URL)).toThrow(ProdGuardError);
    expect(() => assertStagingUrl(PROD_URL)).toThrow(/PRODUCTION/);
  });

  it("throws when the staging ref is absent (unknown target is unsafe)", () => {
    const unknown = "postgresql://postgres.someotherref:pw@host:5432/postgres";
    expect(() => assertStagingUrl(unknown)).toThrow(ProdGuardError);
  });

  it("throws on empty or missing input", () => {
    expect(() => assertStagingUrl("")).toThrow(ProdGuardError);
    expect(() => assertStagingUrl(undefined)).toThrow(ProdGuardError);
    expect(() => assertStagingUrl(null)).toThrow(ProdGuardError);
  });
});

describe("parseEnvFile", () => {
  it("parses key=value, ignores comments and blanks, strips quotes", () => {
    const parsed = parseEnvFile(
      ["# a comment", "", "A=1", 'B="two"', "C='three'", "D=four=five"].join("\n"),
    );
    expect(parsed).toEqual({ A: "1", B: "two", C: "three", D: "four=five" });
  });
});

describe("Rng determinism", () => {
  it("produces an identical sequence from the same seed", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("stays in range and diverges across seeds", () => {
    const r = new Rng(1);
    for (let i = 0; i < 100; i += 1) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(r.int(3, 3)).toBe(3);
    }
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it("emits v4-shaped uuids", () => {
    const id = new Rng(SEED).uuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("buildSeedData", () => {
  const data = buildSeedData(new Rng(SEED));

  it("is deterministic — same seed, same data", () => {
    const again = buildSeedData(new Rng(SEED));
    expect(JSON.stringify(again)).toEqual(JSON.stringify(data));
  });

  it("produces breadth across every seeded surface", () => {
    expect(data.clients.length).toBe(4);
    expect(data.reps.length).toBeGreaterThan(15);
    expect(data.deals.length).toBeGreaterThan(50);
    expect(data.activityReports.length).toBeGreaterThan(100);
    expect(data.activityLogs.length).toBeGreaterThan(100);
    expect(data.quotas.length).toBeGreaterThan(10);
    expect(data.notifications.length).toBeGreaterThan(5);
    expect(data.transactions.length).toBeGreaterThan(100);
    expect(data.eodTemplates.length).toBe(16);
    expect(data.offerSettings.length).toBe(4);
  });

  it("tags every row with the demo-seed marker so reset is exact", () => {
    expect(data.clients.every((c) => c.externalRef === MARKER)).toBe(true);
    expect(data.reps.every((r) => r.externalRef?.startsWith(`${MARKER}:`))).toBe(true);
    expect(data.deals.every((d) => d.externalRef?.startsWith(`${MARKER}:`))).toBe(true);
    expect(
      data.activityLogs.every((l) => l.externalRef?.startsWith(`${MARKER}:`)),
    ).toBe(true);
    expect(data.notifications.every((n) => n.dedupeKey?.startsWith(`${MARKER}:`))).toBe(
      true,
    );
    expect(
      data.transactions.every((t) => t.idempotencyKey?.startsWith(`${MARKER}:`)),
    ).toBe(true);
    expect(data.quotas.every((q) => q.notes?.startsWith(MARKER))).toBe(true);
    expect(
      data.teamMembers.every((m) => m.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`)),
    ).toBe(true);
    expect(data.profiles.every((p) => p.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`))).toBe(
      true,
    );
  });

  it("uses only valid vocabulary for every enum-like column", () => {
    const repRoles = new Set(["closer", "setter", "dm_setter", "manager", "operator"]);
    expect(data.reps.every((r) => repRoles.has(r.role))).toBe(true);

    const directions = new Set(["in", "out"]);
    const layers = new Set(["agency", "client"]);
    const txnSources = new Set(["form", "processor", "manual", "sheet"]);
    for (const t of data.transactions) {
      expect(directions.has(t.direction as string)).toBe(true);
      expect(layers.has(t.layer as string)).toBe(true);
      expect(txnSources.has(t.source as string)).toBe(true);
    }

    const dispositions = new Set([
      "sale_closed",
      "follow_up_booked",
      "rescheduled",
      "not_interested",
      "no_show",
      "dq",
      "wrong_number",
      "bad_lead",
    ]);
    const modes = new Set(["call", "booking"]);
    for (const l of data.activityLogs) {
      expect(modes.has(l.mode as string)).toBe(true);
      expect(dispositions.has(l.disposition as string)).toBe(true);
    }

    const quotaMetrics = new Set([
      "cash_collected",
      "deals",
      "dials",
      "sets_booked",
      "shows",
      "calls_taken",
    ]);
    expect(data.quotas.every((q) => quotaMetrics.has(q.metric as string))).toBe(true);
  });

  it("keeps every foreign key internally consistent", () => {
    const clientIds = new Set(data.clients.map((c) => c.id));
    const repIds = new Set(data.reps.map((r) => r.id));
    const profileIds = new Set(data.profiles.map((p) => p.id));

    expect(data.reps.every((r) => clientIds.has(r.clientId as string))).toBe(true);
    expect(data.reps.every((r) => !r.profileId || profileIds.has(r.profileId))).toBe(
      true,
    );
    expect(data.deals.every((d) => clientIds.has(d.clientId as string))).toBe(true);
    expect(
      data.deals.every((d) => d.repId === null || repIds.has(d.repId as string)),
    ).toBe(true);
    expect(data.activityReports.every((a) => repIds.has(a.repId as string))).toBe(true);
    expect(data.quotas.every((q) => clientIds.has(q.clientId as string))).toBe(true);
  });

  it("anchors all dates to the ANCHOR constant, never the wall clock", () => {
    // Every deal closed on or before the anchor and within a ~90-day window.
    const oldest = shiftDay(ANCHOR_DAY, -90);
    for (const d of data.deals) {
      const day = d.closedAt!.toISOString().slice(0, 10);
      expect(day <= ANCHOR_DAY).toBe(true);
      expect(day >= oldest).toBe(true);
    }
  });
});
