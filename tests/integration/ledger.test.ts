/**
 * @vitest-environment node
 *
 * The append-only guarantee, proved against a real Postgres.
 *
 * These are the most important tests in the codebase. If any of them ever goes
 * red, money history has become editable, and every other guarantee in the
 * accounting module rests on it not being.
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

describe.skipIf(!databaseUrl)("ledger append-only guarantee", () => {
  let sql: postgres.Sql;
  let clientId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });

    const slug = `test-client-${Date.now()}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Test Client', ${slug})
      returning id
    `;
    clientId = client.id;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function insertEvent(amount: number, key: string) {
    const [row] = await sql<{ id: string }[]>`
      insert into ledger.money_events
        (occurred_at, event_type, amount_cents, client_id, source, idempotency_key)
      values
        (now(), 'payment_received', ${amount}, ${clientId}, 'test', ${key})
      returning id
    `;
    return row.id;
  }

  it("accepts an insert", async () => {
    const id = await insertEvent(135898, `ok-${Date.now()}`);
    expect(id).toBeTruthy();
  });

  it("REJECTS an update", async () => {
    const id = await insertEvent(1000, `upd-${Date.now()}`);

    await expect(
      sql`update ledger.money_events set amount_cents = 9999 where id = ${id}`,
    ).rejects.toThrow(/append-only/i);

    // And the value is genuinely untouched.
    const [row] = await sql<{ amount_cents: string }[]>`
      select amount_cents from ledger.money_events where id = ${id}
    `;
    expect(Number(row.amount_cents)).toBe(1000);
  });

  it("REJECTS a delete", async () => {
    const id = await insertEvent(2000, `del-${Date.now()}`);

    await expect(sql`delete from ledger.money_events where id = ${id}`).rejects.toThrow(
      /append-only/i,
    );

    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from ledger.money_events where id = ${id}
    `;
    expect(row.n).toBe(1);
  });

  it("REJECTS a truncate, which bypasses row triggers", async () => {
    await expect(sql`truncate ledger.money_events`).rejects.toThrow(/append-only/i);
  });

  it("refuses a duplicate idempotency key, so a retry cannot double-count", async () => {
    const key = `dup-${Date.now()}`;
    await insertEvent(500, key);
    await expect(insertEvent(500, key)).rejects.toThrow();
  });

  it("refuses a zero amount, which is always a mistake", async () => {
    await expect(insertEvent(0, `zero-${Date.now()}`)).rejects.toThrow(/nonzero/i);
  });

  it("refuses an amount large enough to be a units error", async () => {
    // Dollars entered where cents were expected, or a stray multiplication.
    await expect(insertEvent(9_999_999_999_999, `huge-${Date.now()}`)).rejects.toThrow(
      /sane/i,
    );
  });

  it("allows a correction as a reversing row, which is the supported path", async () => {
    const originalKey = `rev-orig-${Date.now()}`;
    const originalId = await insertEvent(7500, originalKey);

    const [reversal] = await sql<{ id: string }[]>`
      insert into ledger.money_events
        (occurred_at, event_type, amount_cents, client_id, source, idempotency_key, reverses_id)
      values
        (now(), 'adjustment', ${-7500}, ${clientId}, 'test', ${`rev-${originalKey}`}, ${originalId})
      returning id
    `;
    expect(reversal.id).toBeTruthy();

    // The pair nets to exactly zero, and both rows still exist as evidence.
    const [net] = await sql<{ total: string }[]>`
      select coalesce(sum(amount_cents), 0)::bigint as total
      from ledger.money_events
      where id in (${originalId}, ${reversal.id})
    `;
    expect(Number(net.total)).toBe(0);
  });

  it("refuses an event that reverses itself", async () => {
    const id = await insertEvent(100, `self-${Date.now()}`);
    // Cannot be set after the fact either, since UPDATE is blocked outright.
    await expect(
      sql`update ledger.money_events set reverses_id = ${id} where id = ${id}`,
    ).rejects.toThrow(/append-only/i);
  });
});
