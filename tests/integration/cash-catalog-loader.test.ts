/**
 * @vitest-environment node
 *
 * The cash catalog against a real Postgres: the processor snapshot wins over
 * the sheet, tag rules apply, the offer's fee rate estimates cash after fees,
 * and "paid with no call first" reads each invitee's first non-cancelled call
 * (case-insensitive email) against the payment time.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { loadCashCatalog } from "@/lib/tracking/cash-catalog-loader";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };

describe.skipIf(!databaseUrl)("loadCashCatalog", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function makeClient(label: string, feeBps: number | null) {
    const slug = `cash-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug, processor_fee_bps)
      values (${"Cash " + label}, ${slug}, ${feeBps}) returning id`;
    return client.id;
  }

  async function feed(
    clientId: string,
    source: "stripe" | "sheet",
    rows: { email: string; cents: number; at: string; notes?: string }[],
  ) {
    const [sync] = await sql<{ id: string }[]>`
      insert into app.client_tracking_syncs (client_id, source, spreadsheet_id, row_count)
      values (${clientId}, ${source}, ${"test-" + source}, ${rows.length}) returning id`;
    let i = 0;
    for (const r of rows) {
      i += 1;
      await sql`
        insert into app.client_tracking_rows
          (sync_id, client_id, tab, source, row_index, occurred_at, email, status, cash_cents, notes, payload)
        values (${sync.id}, ${clientId}, 'payments', ${source}, ${i}, ${r.at}, ${r.email},
          'succeeded', ${r.cents}, ${r.notes ?? null}, ${sql.json({ charge: `ch_${source}_${i}` })})`;
    }
  }

  it("reads the processor feed through tag rules, fees and first calls", async () => {
    const clientId = await makeClient("full", 290);
    // The sheet says something else entirely; the processor snapshot must win.
    await feed(clientId, "sheet", [
      { email: "a@example.test", cents: 999_999, at: "2026-09-01T15:00:00Z" },
    ]);
    await feed(clientId, "stripe", [
      { email: "a@example.test", cents: 100_000, at: "2026-09-10T15:30:00Z" },
      { email: "b@example.test", cents: 50_000, at: "2026-09-11T15:30:00Z" },
      { email: "ops@example.test", cents: 100, at: "2026-09-12T15:30:00Z", notes: "TEST" },
    ]);
    await sql`
      insert into app.payment_tag_rules (client_id, tag, match_field, match_op, match_value, exclude)
      values (${clientId}, 'test', 'label', 'contains', 'test', true)`;
    const [integration] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('calendly', 'cash test', ${clientId}, 'connected') returning id`;
    // A (mixed case) had a call before paying; B's only call was cancelled.
    await sql`
      insert into app.bookings (integration_id, provider, external_id, client_id, invitee_email, starts_at, status)
      values
        (${integration.id}, 'calendly', ${crypto.randomUUID()}, ${clientId}, 'A@Example.test', '2026-09-09T20:00:00Z', 'booked'),
        (${integration.id}, 'calendly', ${crypto.randomUUID()}, ${clientId}, 'b@example.test', '2026-09-10T20:00:00Z', 'canceled')`;

    const data = await loadCashCatalog(clientId, ALL, "2026-09-30", TZ);
    expect(data.source).toBe("stripe");
    const c = data.catalog!;
    expect(c.cashCollectedCents).toBe(150_000);
    expect(c.hidden).toMatchObject({ count: 1, cents: 100 });
    expect(c.payers).toBe(2);
    expect(c.noCallCents).toBe(50_000);
    expect(c.afterFeesEstimateCents).toBe(150_000 - 4_350);
  });

  it("has no catalog without a payment feed", async () => {
    const clientId = await makeClient("empty", null);
    const data = await loadCashCatalog(clientId, ALL, "2026-09-30", TZ);
    expect(data).toEqual({ source: null, syncedAt: null, catalog: null });
  });
});
