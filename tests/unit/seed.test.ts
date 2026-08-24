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

  it("keeps every activity report an internally consistent funnel", () => {
    const roleById = new Map(data.reps.map((r) => [r.id as string, r.role]));
    for (const a of data.activityReports) {
      const m = a.metrics as Record<string, number>;
      const role = roleById.get(a.repId as string);
      // Shows never exceed the sets or the calls they came from — the two
      // denominators the app divides shows by (Leaderboard, EOD page).
      if (m.sets_booked != null)
        expect(m.shows ?? 0).toBeLessThanOrEqual(m.sets_booked);
      if (m.calls_taken != null)
        expect(m.shows ?? 0).toBeLessThanOrEqual(m.calls_taken);
      if (m.no_shows != null) expect(m.no_shows).toBeGreaterThanOrEqual(0);
      // Setter set rate = sets/dials ≤ 100%; DM set rate = sets/dms ≤ 100%.
      if (role === "setter") {
        expect(m.sets_booked ?? 0).toBeLessThanOrEqual(m.connects ?? 0);
        expect(m.connects ?? 0).toBeLessThanOrEqual(m.dials ?? 0);
      }
      if (role === "dm_setter") {
        expect(m.sets_booked ?? 0).toBeLessThanOrEqual(m.connects ?? 0);
        expect(m.connects ?? 0).toBeLessThanOrEqual(m.dms_sent ?? 0);
      }
    }
  });

  it("keeps every rep's Show % and Close % ≤ 100%, and closers in band", () => {
    const showsByRep = new Map<string, number>();
    const setsByRep = new Map<string, number>();
    for (const a of data.activityReports) {
      const m = a.metrics as Record<string, number>;
      const id = a.repId as string;
      showsByRep.set(id, (showsByRep.get(id) ?? 0) + (m.shows ?? 0));
      setsByRep.set(id, (setsByRep.get(id) ?? 0) + (m.sets_booked ?? 0));
    }
    const dealsByRep = new Map<string, number>();
    for (const d of data.deals) {
      if (!d.repId) continue;
      const id = d.repId as string;
      dealsByRep.set(id, (dealsByRep.get(id) ?? 0) + 1);
    }

    let allShows = 0;
    let allDeals = 0;
    let closerShows = 0;
    let closerSets = 0;
    for (const rep of data.reps) {
      const id = rep.id as string;
      const shows = showsByRep.get(id) ?? 0;
      const sets = setsByRep.get(id) ?? 0;
      const dealsN = dealsByRep.get(id) ?? 0;
      // The two rates that used to blow past 100% now cannot, for any rep.
      expect(shows).toBeLessThanOrEqual(sets); // Show % ≤ 100%
      expect(dealsN).toBeLessThanOrEqual(shows); // Close % ≤ 100%
      allShows += shows;
      allDeals += dealsN;
      if (rep.role === "closer") {
        closerShows += shows;
        closerSets += sets;
      }
    }

    // Only closers carry shows, so every closer with any activity produced cash.
    expect(closerShows).toBeGreaterThan(0);
    // Overall close rate (the headline KPI) lands in a believable band.
    const closePct = (allDeals / allShows) * 100;
    expect(closePct).toBeGreaterThanOrEqual(15);
    expect(closePct).toBeLessThanOrEqual(40);
    // Closer show rate lands in the 40–75% band.
    const showPct = (closerShows / closerSets) * 100;
    expect(showPct).toBeGreaterThanOrEqual(40);
    expect(showPct).toBeLessThanOrEqual(75);
  });

  it("seeds collected cash in the ledger so producing reps light up", () => {
    const dealIds = new Set(data.deals.map((d) => d.id));
    const clientIds = new Set(data.clients.map((c) => c.id));
    expect(data.moneyEvents.length).toBeGreaterThan(0);
    for (const ev of data.moneyEvents) {
      expect(ev.eventType).toBe("payment_received");
      expect(ev.amountCents as number).toBeGreaterThan(0);
      expect(ev.idempotencyKey?.startsWith(`${MARKER}:`)).toBe(true);
      expect(dealIds.has(ev.dealId as string)).toBe(true);
      expect(clientIds.has(ev.clientId as string)).toBe(true);
    }

    // Each closed deal has exactly one payment, so every closer with a deal has
    // non-zero cash — no more $0 rep Cash on the Leaderboard.
    const cashByDeal = new Map<string, number>();
    for (const ev of data.moneyEvents) {
      cashByDeal.set(ev.dealId as string, ev.amountCents as number);
    }
    const cashByRep = new Map<string, number>();
    for (const d of data.deals) {
      if (!d.repId) continue;
      const id = d.repId as string;
      cashByRep.set(id, (cashByRep.get(id) ?? 0) + (cashByDeal.get(d.id) ?? 0));
    }
    const closersWithDeals = data.reps.filter(
      (r) => r.role === "closer" && (cashByRep.get(r.id as string) ?? 0) > 0,
    );
    expect(closersWithDeals.length).toBeGreaterThan(0);
  });
});
