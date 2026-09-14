/**
 * @vitest-environment node
 *
 * The lean sales/offer read path, proved against a real Postgres.
 *
 * Two mechanical perf refactors are asserted here to be behaviour-preserving:
 *
 *   FIX A — several sales loaders fetch their independent rows in one Promise.all
 *   wave instead of serially. Parallelising must not change a single number, so
 *   this pins the values each parallelised loader returns from known rows.
 *
 *   FIX B — the offer surfaces used to load EVERY client's call logs and deals
 *   and then filter by clientId in JS. The filter now lives in SQL (the
 *   activity_logs_client_idx / deals_client_idx indexes). The guarantee that
 *   `listCallLogs(500, clientId)` returns EXACTLY the rows the old JS filter
 *   produced — same rows, same order — is a fact about SQL, so it is asserted
 *   against a database, not a mock.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  activityLogs,
  activityReports,
  clients,
  commissionSplits,
  deals,
  reps,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { listCallLogs } from "@/lib/sales/call-queries";
import {
  getCommissionRollup,
  getEodCompliance,
  getLeaderboard,
  getSalesOverview,
  listDeals,
} from "@/lib/sales/queries";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("lean read path (FIX A + FIX B)", () => {
  // A unique marker per run so seeded rows never collide with another test
  // file's data in the shared integration database.
  const tag = `lean-${Date.now()}`;
  const base = Date.parse("2026-05-01T00:00:00Z");

  let clientAId: string;
  let clientBId: string;
  let repAId: string;
  let repBId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    const db = getDb();

    // Two offers, each with one closer.
    const [ca] = await db
      .insert(clients)
      .values({ name: `Offer A ${tag}`, slug: `a-${tag}` })
      .returning({ id: clients.id });
    const [cb] = await db
      .insert(clients)
      .values({ name: `Offer B ${tag}`, slug: `b-${tag}` })
      .returning({ id: clients.id });
    clientAId = ca.id;
    clientBId = cb.id;

    const [ra] = await db
      .insert(reps)
      .values({ clientId: clientAId, name: `Rep A ${tag}`, role: "closer" })
      .returning({ id: reps.id });
    const [rb] = await db
      .insert(reps)
      .values({ clientId: clientBId, name: `Rep B ${tag}`, role: "closer" })
      .returning({ id: reps.id });
    repAId = ra.id;
    repBId = rb.id;

    // Call logs: 3 for A, 2 for B, all with DISTINCT occurredAt so ordering is
    // deterministic (no ties for the SQL/JS comparison to disagree on).
    await db.insert(activityLogs).values([
      {
        clientId: clientAId,
        repId: repAId,
        disposition: "sale_closed",
        occurredAt: new Date(base + 5 * 60_000),
        externalRef: `log-a1-${tag}`,
      },
      {
        clientId: clientAId,
        repId: repAId,
        disposition: "no_show",
        occurredAt: new Date(base + 3 * 60_000),
        externalRef: `log-a2-${tag}`,
      },
      {
        clientId: clientAId,
        repId: repAId,
        disposition: "follow_up_booked",
        occurredAt: new Date(base + 1 * 60_000),
        externalRef: `log-a3-${tag}`,
      },
      {
        clientId: clientBId,
        repId: repBId,
        disposition: "sale_closed",
        occurredAt: new Date(base + 4 * 60_000),
        externalRef: `log-b1-${tag}`,
      },
      {
        clientId: clientBId,
        repId: repBId,
        disposition: "dq",
        occurredAt: new Date(base + 2 * 60_000),
        externalRef: `log-b2-${tag}`,
      },
    ]);

    // Deals: 2 for A, 1 for B, distinct closedAt.
    const [da1] = await db
      .insert(deals)
      .values({
        clientId: clientAId,
        dealType: "Other",
        contractValueCents: 500_000,
        repId: repAId,
        closedAt: new Date(base + 10 * 60_000),
        agreementSigned: "yes",
        externalRef: `deal-a1-${tag}`,
      })
      .returning({ id: deals.id });
    await db.insert(deals).values({
      clientId: clientAId,
      dealType: "Other",
      contractValueCents: 300_000,
      repId: repAId,
      closedAt: new Date(base + 8 * 60_000),
      externalRef: `deal-a2-${tag}`,
    });
    const [db1] = await db
      .insert(deals)
      .values({
        clientId: clientBId,
        dealType: "Other",
        contractValueCents: 200_000,
        repId: repBId,
        closedAt: new Date(base + 9 * 60_000),
        agreementSigned: "yes",
        externalRef: `deal-b1-${tag}`,
      })
      .returning({ id: deals.id });

    // Cash: 250k collected on A's first deal, 150k on B's.
    await db.insert(moneyEvents).values([
      {
        occurredAt: new Date(base),
        eventType: "payment_received",
        amountCents: 250_000,
        clientId: clientAId,
        dealId: da1.id,
        source: "test",
        idempotencyKey: `pay-a1-${tag}`,
      },
      {
        occurredAt: new Date(base),
        eventType: "payment_received",
        amountCents: 150_000,
        clientId: clientBId,
        dealId: db1.id,
        source: "test",
        idempotencyKey: `pay-b1-${tag}`,
      },
    ]);

    // Two EOD reports for Rep A, so the leaderboard has metrics to sum.
    await db.insert(activityReports).values([
      {
        repId: repAId,
        clientId: clientAId,
        reportDate: new Date(base),
        kind: "eod",
        metrics: { dials: 10, shows: 2, sets_booked: 4 },
        externalRef: `rep-a-r1-${tag}`,
      },
      {
        repId: repAId,
        clientId: clientAId,
        reportDate: new Date(base + 60_000),
        kind: "eod",
        metrics: { dials: 5, shows: 1 },
        externalRef: `rep-a-r2-${tag}`,
      },
    ]);
  });

  afterAll(async () => {
    await closeDb();
  });

  // ---- FIX B: the SQL client filter equals the old JS client filter ----

  it("listCallLogs(clientId) returns exactly what the JS client filter would", async () => {
    const all = await listCallLogs(500);
    // Premise: the defensive 500 cap is not binding in this dataset, so the JS
    // filter is a COMPLETE view of each client's logs (this is the current prod
    // reality; the cap is future-proofing). If this ever fails the two views
    // would legitimately diverge and the assertion below would flag it.
    expect(all.length).toBeLessThan(500);

    const jsA = all.filter((c) => c.clientId === clientAId);
    const sqlA = await listCallLogs(500, clientAId);
    expect(sqlA).toEqual(jsA);
    expect(sqlA).toHaveLength(3);
    expect(sqlA.every((c) => c.clientId === clientAId)).toBe(true);

    const jsB = all.filter((c) => c.clientId === clientBId);
    const sqlB = await listCallLogs(500, clientBId);
    expect(sqlB).toEqual(jsB);
    expect(sqlB).toHaveLength(2);
  });

  it("listCallLogs() with no clientId is unchanged — every client's rows", async () => {
    const all = await listCallLogs(500);
    const ids = new Set(all.map((c) => c.clientId));
    expect(ids.has(clientAId)).toBe(true);
    expect(ids.has(clientBId)).toBe(true);
  });

  it("listDeals(clientId) returns exactly what the JS client filter would", async () => {
    const all = await listDeals();
    const jsA = all.filter((d) => d.clientId === clientAId);
    const sqlA = await listDeals(clientAId);
    expect(sqlA).toEqual(jsA);
    expect(sqlA).toHaveLength(2);
    expect(sqlA.every((d) => d.clientId === clientAId)).toBe(true);
    // Cash per deal is identical whether summed over one client's ids or all.
    const a1 = sqlA.find((d) => d.revenueCents === 500_000);
    expect(a1?.cashCollectedCents).toBe(250_000);

    const sqlB = await listDeals(clientBId);
    expect(sqlB).toEqual(all.filter((d) => d.clientId === clientBId));
    expect(sqlB).toHaveLength(1);
  });

  // ---- FIX A: parallelised loaders return the same shape and values ----

  it("getLeaderboard totals each rep's activity, deals and cash, ranked by cash", async () => {
    const rows = await getLeaderboard();
    const a = rows.find((r) => r.repId === repAId);
    expect(a).toBeDefined();
    expect(a!.clientId).toBe(clientAId);
    expect(a!.dials).toBe(15); // 10 + 5, summed across both reports
    expect(a!.shows).toBe(3); // 2 + 1
    expect(a!.setsBooked).toBe(4);
    expect(a!.dealsClosed).toBe(2);
    expect(a!.cashCents).toBe(250_000);

    // The whole board stays sorted by cash, then deals, then shows.
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const ordered =
        prev.cashCents > cur.cashCents ||
        (prev.cashCents === cur.cashCents &&
          (prev.dealsClosed > cur.dealsClosed ||
            (prev.dealsClosed === cur.dealsClosed && prev.shows >= cur.shows)));
      expect(ordered).toBe(true);
    }
  });

  it("getSalesOverview counts deals, revenue, cash and active teams", async () => {
    const before = await getSalesOverview();
    const db = getDb();
    const [c] = await db
      .insert(clients)
      .values({ name: `Overview Δ ${tag}`, slug: `ov-${tag}` })
      .returning({ id: clients.id });
    const [deal] = await db
      .insert(deals)
      .values({
        clientId: c.id,
        dealType: "Other",
        contractValueCents: 777_000,
        closedAt: new Date(),
        externalRef: `deal-ov-${tag}`,
      })
      .returning({ id: deals.id });
    await db.insert(moneyEvents).values({
      occurredAt: new Date(),
      eventType: "payment_received",
      amountCents: 111_000,
      clientId: c.id,
      dealId: deal.id,
      source: "test",
      idempotencyKey: `pay-ov-${tag}`,
    });

    const after = await getSalesOverview();
    expect(after.dealsClosed - before.dealsClosed).toBe(1);
    expect(after.revenueCents - before.revenueCents).toBe(777_000);
    expect(after.cashCollectedCents - before.cashCollectedCents).toBe(111_000);
    expect(after.teamCount - before.teamCount).toBe(1);
  });

  it("getCommissionRollup sums the book and pays an explicit split", async () => {
    const before = await getCommissionRollup();
    const db = getDb();
    const [c] = await db
      .insert(clients)
      .values({ name: `Rollup Δ ${tag}`, slug: `cr-${tag}` })
      .returning({ id: clients.id });
    const [rep] = await db
      .insert(reps)
      .values({ clientId: c.id, name: `Rollup Rep ${tag}`, role: "closer" })
      .returning({ id: reps.id });
    const [deal] = await db
      .insert(deals)
      .values({
        clientId: c.id,
        dealType: "Other",
        contractValueCents: 400_000,
        repId: rep.id,
        closedAt: new Date(),
        agreementSigned: "yes",
        externalRef: `deal-cr-${tag}`,
      })
      .returning({ id: deals.id });
    // An explicit 10% closer split on cash collected.
    await db.insert(commissionSplits).values({
      dealId: deal.id,
      repId: rep.id,
      role: "closer",
      rateBps: 1000,
      basis: "cash_collected",
    });
    await db.insert(moneyEvents).values({
      occurredAt: new Date(),
      eventType: "payment_received",
      amountCents: 220_000,
      clientId: c.id,
      dealId: deal.id,
      source: "test",
      idempotencyKey: `pay-cr-${tag}`,
    });

    const after = await getCommissionRollup();
    expect(after.teamRevenueCents - before.teamRevenueCents).toBe(400_000);
    expect(after.teamCashCents - before.teamCashCents).toBe(220_000);
    const line = after.reps.find((r) => r.repId === rep.id);
    expect(line).toBeDefined();
    expect(line!.totalOwedCents).toBe(22_000); // 10% of 220,000 collected
  });

  it("getEodCompliance credits today's filer and flags the one who didn't", async () => {
    const db = getDb();
    const now = new Date("2026-06-15T18:00:00Z"); // afternoon, unambiguous CT day
    const [c] = await db
      .insert(clients)
      .values({ name: `EOD Δ ${tag}`, slug: `eod-${tag}` })
      .returning({ id: clients.id });
    const filerName = `Filer ${tag}`;
    const slackerName = `Slacker ${tag}`;
    const [filer] = await db
      .insert(reps)
      .values({ clientId: c.id, name: filerName, role: "closer" })
      .returning({ id: reps.id });
    await db.insert(reps).values({ clientId: c.id, name: slackerName, role: "closer" });
    await db.insert(activityReports).values({
      repId: filer.id,
      clientId: c.id,
      reportDate: now,
      kind: "eod",
      metrics: {},
      externalRef: `eod-filer-${tag}`,
    });

    const comp = await getEodCompliance("eod", now);
    expect(comp.missing).not.toContain(filerName);
    expect(comp.missing).toContain(slackerName);
    expect(comp.total).toBeGreaterThanOrEqual(2);
    expect(comp.submitted).toBe(comp.total - comp.missing.length);
  });

  it("getEodCompliance drops reps whose client is archived from the roster", async () => {
    const db = getDb();
    const now = new Date("2026-06-16T18:00:00Z");
    const [c] = await db
      .insert(clients)
      .values({ name: `Archived Δ ${tag}`, slug: `arch-${tag}`, status: "archived" })
      .returning({ id: clients.id });
    const archivedRepName = `Archived Rep ${tag}`;
    await db
      .insert(reps)
      .values({ clientId: c.id, name: archivedRepName, role: "closer" });

    const comp = await getEodCompliance("eod", now);
    expect(comp.missing).not.toContain(archivedRepName);
  });
});
