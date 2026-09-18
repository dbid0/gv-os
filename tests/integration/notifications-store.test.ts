/**
 * @vitest-environment node
 *
 * Filing alert candidates against a real Postgres. Rules re-derive the same
 * candidates on every run, so what matters is that a repeat is filed once and
 * — because only newly-fired alerts are delivered to Discord — that the
 * "which ones are new" answer is exact. Getting it wrong pages the team about
 * an alert they already saw, every half hour, forever.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { fileNewNotifications } from "@/lib/notifications/store";
import type { Candidate } from "@/lib/notifications/rules";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("filing notifications", () => {
  let sql: postgres.Sql;
  let tag: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const candidate = (key: string, over: Partial<Candidate> = {}): Candidate => ({
    kind: "sync_failure",
    severity: "warning",
    title: `Alert ${key}`,
    body: null,
    clientId: null,
    dedupeKey: `${tag}:${key}`,
    ...over,
  });

  const rowsFor = async (key: string) =>
    sql`select count(*)::int as n from app.notifications where dedupe_key = ${`${tag}:${key}`}`;

  it("files every new candidate and returns all of them", async () => {
    const out = await fileNewNotifications([candidate("a"), candidate("b")]);
    expect(out.map((c) => c.dedupeKey)).toEqual([`${tag}:a`, `${tag}:b`]);
  });

  it("returns nothing the second time the same alert is offered", async () => {
    // The condition has not cleared, so the rule offers it again. Nobody
    // should be paged twice.
    await fileNewNotifications([candidate("repeat")]);
    const second = await fileNewNotifications([candidate("repeat")]);
    expect(second).toEqual([]);
    expect(await rowsFor("repeat")).toEqual([{ n: 1 }]);
  });

  it("returns only the new ones when a batch mixes old and new", async () => {
    await fileNewNotifications([candidate("known")]);
    const out = await fileNewNotifications([
      candidate("known"),
      candidate("fresh"),
      candidate("alsofresh"),
    ]);
    expect(out.map((c) => c.dedupeKey)).toEqual([`${tag}:fresh`, `${tag}:alsofresh`]);
  });

  it("keeps the caller's order, not the database's", async () => {
    // The Discord batch reads in rule order, which is roughly severity order.
    const out = await fileNewNotifications([
      candidate("z-first", { severity: "critical" }),
      candidate("a-second"),
    ]);
    expect(out.map((c) => c.dedupeKey)).toEqual([`${tag}:z-first`, `${tag}:a-second`]);
  });

  it("files one row when a single run offers the same key twice", async () => {
    const out = await fileNewNotifications([
      candidate("twice", { title: "First wins" }),
      candidate("twice", { title: "Second loses" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("First wins");
    expect(await rowsFor("twice")).toEqual([{ n: 1 }]);
  });

  it("stores what it was given", async () => {
    await fileNewNotifications([
      candidate("stored", {
        severity: "critical",
        title: "A real title",
        body: "A real body",
      }),
    ]);
    const [row] = await sql<
      { kind: string; severity: string; title: string; body: string }[]
    >`
      select kind, severity, title, body from app.notifications
       where dedupe_key = ${`${tag}:stored`}`;
    expect(row).toMatchObject({
      kind: "sync_failure",
      severity: "critical",
      title: "A real title",
      body: "A real body",
    });
  });

  it("does nothing, and asks the database nothing, for an empty run", async () => {
    expect(await fileNewNotifications([])).toEqual([]);
  });
});
