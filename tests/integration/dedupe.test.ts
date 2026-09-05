/**
 * @vitest-environment node
 *
 * The guards that stop one real sale being recorded twice, proved against a
 * real Postgres.
 *
 * Every one of these rests on a UNIQUE INDEX existing. `onConflictDoNothing()`
 * is silent when nothing conflicts: without the index the clause is decoration,
 * the insert succeeds, and a rep's cash is counted twice with every unit test
 * still green. That is exactly the kind of failure a schema change causes and
 * no amount of pure-function testing can catch, so it is asserted here.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@/db/migrate";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("one sale is recorded once", () => {
  let sql: postgres.Sql;
  let clientId: string;
  let repId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const slug = `dedupe-client-${Date.now()}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Dedupe Client', ${slug})
      returning id`;
    clientId = client.id;
    const [rep] = await sql<{ id: string }[]>`
      insert into app.reps (client_id, name, role) values (${clientId}, 'Dedupe Rep', 'closer')
      returning id`;
    repId = rep.id;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("an EOD cannot be filed twice for the same rep, day and cadence", async () => {
    const ref = `eod:${repId}:2026-09-04:eod`;
    const insert = () => sql`
      insert into app.activity_reports (rep_id, client_id, report_date, kind, metrics, external_ref)
      values (${repId}, ${clientId}, '2026-09-04', 'eod', '{}'::jsonb, ${ref})
      on conflict do nothing
      returning id`;

    expect((await insert()).length).toBe(1);
    // The second submit must write nothing at all.
    expect((await insert()).length).toBe(0);

    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int n from app.activity_reports where external_ref = ${ref}`;
    expect(n).toBe(1);
  });

  it("a closer's EOD deal cannot be created twice for the same day", async () => {
    // This is what stops the cash being counted twice: the deal insert returns
    // nothing on the second submit, and submitEod skips the money events when
    // no deal came back.
    const ref = `eod-deal:${repId}:2026-09-04`;
    const insert = () => sql<{ id: string }[]>`
      insert into app.deals
        (client_id, deal_type, contract_value_cents, rep_id, closed_at, agreement_signed, external_ref)
      values (${clientId}, 'Other', 500000, ${repId}, '2026-09-04', 'yes', ${ref})
      on conflict do nothing
      returning id`;

    const first = await insert();
    expect(first.length).toBe(1);
    const second = await insert();
    expect(second.length).toBe(0);
  });

  it("the ledger refuses the same idempotency key twice", async () => {
    const key = `dedupe-${Date.now()}`;
    const insert = () => sql`
      insert into ledger.money_events
        (occurred_at, event_type, amount_cents, client_id, source, idempotency_key)
      values (now(), 'payment_received', 250000, ${clientId}, 'test', ${key})`;

    await insert();
    // Not "does nothing" — the ledger REJECTS it, so a bug cannot pass silently.
    await expect(insert()).rejects.toThrow();
  });

  it("every conflict clause the app relies on is backed by a unique index", async () => {
    // Named explicitly: these four are what the dedupe guards depend on. A
    // migration that drops one turns every `onConflictDoNothing` above into a
    // no-op that inserts.
    const rows = await sql<{ tablename: string; indexdef: string }[]>`
      select tablename, indexdef from pg_indexes
      where schemaname in ('app', 'ledger') and indexdef ilike '%UNIQUE%'`;
    const has = (table: string, column: string) =>
      rows.some((r) => r.tablename === table && r.indexdef.includes(column));

    expect(has("activity_reports", "external_ref")).toBe(true);
    expect(has("deals", "external_ref")).toBe(true);
    expect(has("money_events", "idempotency_key")).toBe(true);
    expect(has("transactions", "idempotency_key")).toBe(true);
  });
});
