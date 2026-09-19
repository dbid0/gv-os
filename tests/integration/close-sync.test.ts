/**
 * @vitest-environment node
 *
 * The Close pull against a real Postgres and a fake Close API.
 *
 * The pull now reads incrementally (only what is new since the last success,
 * with a periodic full sweep) and inserts a page per statement instead of a
 * row per statement. Both are about cost now that the sync runs continuously,
 * and neither may change WHAT gets captured — that is what this checks.
 */
import { randomBytes } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seal } from "@/lib/crypto/secretbox";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

type Activity = { id: string; date_created: string; lead_id?: string };

/** A fake Close: activity lists filtered by date_created__gt, and leads. */
function fakeClose(calls: Activity[], seenSince: string[]) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.includes("/lead/")) {
      return Response.json({ id: "lead", contacts: [] });
    }
    const since = url.searchParams.get("date_created__gt") ?? "";
    const skip = Number(url.searchParams.get("_skip") ?? 0);
    const limit = Number(url.searchParams.get("_limit") ?? 100);
    if (url.pathname.includes("/activity/call/")) seenSince.push(since);
    const pool = url.pathname.includes("/activity/call/") ? calls : [];
    const matching = pool.filter((a) => a.date_created > since);
    return Response.json({
      data: matching.slice(skip, skip + limit),
      has_more: skip + limit < matching.length,
    });
  });
}

describe.skipIf(!databaseUrl)("Close pull", () => {
  let sql: postgres.Sql;
  let integrationId: string;
  let pullCloseActivity: typeof import("@/lib/crm/close-sync").pullCloseActivity;
  // Activity ids are unique across the whole table, so every run needs its
  // own — otherwise a second local run finds its ids already stored.
  let tag: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    // The vault key the pull opens credentials with. Set before the module
    // loads so the server env picks it up.
    const credentialsKey = randomBytes(32).toString("base64");
    process.env.CREDENTIALS_KEY = credentialsKey;
    ({ pullCloseActivity } = await import("@/lib/crm/close-sync"));

    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [{ id: clientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Close pull', ${"close-pull-" + tag})
      returning id`;
    [{ id: integrationId }] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, secret_box, status)
      values ('close', ${"close pull " + tag}, ${clientId},
              ${seal("fake-close-key", credentialsKey)}, 'connected')
      returning id`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const mine = async () =>
    (await pullCloseActivity()).find((r) => r.integrationId === integrationId)!;

  const stored = async () =>
    (
      await sql<{ n: number }[]>`
        select count(*)::int as n from app.crm_activity
         where integration_id = ${integrationId}`
    )[0].n;

  const recent = (minutesAgo: number, id: string): Activity => ({
    id: `${tag}-${id}`,
    date_created: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
  });

  it("sweeps the full window first and captures every activity", async () => {
    const calls = Array.from({ length: 250 }, (_, i) => recent(60 + i, `acti_${i}`));
    const since: string[] = [];
    vi.stubGlobal("fetch", fakeClose(calls, since));

    const out = await mine();
    expect(out.error).toBeUndefined();
    // 250 across three pages of 100 — every page landed.
    expect(out.captured).toBe(250);
    expect(await stored()).toBe(250);
    // A first pull reads the whole thirty days.
    const daysBack = (Date.now() - new Date(since[0]).getTime()) / 86_400_000;
    expect(Math.round(daysBack)).toBe(30);
  });

  it("records the sweep, so the next pass can go incremental", async () => {
    const [row] = await sql<{ config: Record<string, unknown> }[]>`
      select config from app.integrations where id = ${integrationId}`;
    expect(typeof row.config.closeFullSweepAt).toBe("string");
  });

  it("reads only recent activity on the next pass, and stores only the new ones", async () => {
    const calls = [
      ...Array.from({ length: 250 }, (_, i) => recent(60 + i, `acti_${i}`)),
      recent(1, "acti_new_1"),
      recent(1, "acti_new_2"),
    ];
    const since: string[] = [];
    vi.stubGlobal("fetch", fakeClose(calls, since));

    const out = await mine();
    expect(out.captured).toBe(2);
    expect(await stored()).toBe(252);
    // Incremental: the window starts minutes ago, not thirty days ago.
    const minutesBack = (Date.now() - new Date(since[0]).getTime()) / 60_000;
    expect(minutesBack).toBeLessThan(60);
  });

  it("re-running with nothing new captures nothing and duplicates nothing", async () => {
    vi.stubGlobal("fetch", fakeClose([recent(1, "acti_new_1")], []));
    const out = await mine();
    expect(out.captured).toBe(0);
    expect(await stored()).toBe(252);
  });

  it("never sends one activity id twice in the same insert", async () => {
    // Close ids are unique, but a page repeating one must not break the batch.
    vi.stubGlobal(
      "fetch",
      fakeClose([recent(1, "acti_dupe"), recent(1, "acti_dupe")], []),
    );
    const out = await mine();
    expect(out.error).toBeUndefined();
    expect(out.captured).toBe(1);
  });

  it("leaves lastSyncAt alone when the pull fails", async () => {
    const [before] = await sql<{ last_sync_at: Date }[]>`
      select last_sync_at from app.integrations where id = ${integrationId}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const out = await mine();
    expect(out.error).toMatch(/503/);
    const [after] = await sql<{ last_sync_at: Date }[]>`
      select last_sync_at from app.integrations where id = ${integrationId}`;
    // lastSyncAt always means last SUCCESS — the next pass must still reach
    // back far enough to cover the failed one.
    expect(after.last_sync_at).toEqual(before.last_sync_at);
  });
});
