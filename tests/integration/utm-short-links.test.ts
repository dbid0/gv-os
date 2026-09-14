/**
 * @vitest-environment node
 *
 * UTM short links against a real Postgres: a generated link gets a valid code,
 * following it returns the stored URL and counts the click atomically, unknown
 * or malformed codes resolve to nothing, and the migration's backfill gives
 * every pre-existing link a valid, unique code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { isShortCode } from "@/lib/marketing/short-link";
import {
  createUtmLink,
  followShortLink,
  listUtmLinks,
} from "@/lib/marketing/utm-links";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("UTM short links", () => {
  let sql: postgres.Sql;
  let clientId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const slug = `utm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [{ id: clientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('UTM Test', ${slug}) returning id`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const create = () =>
    createUtmLink({
      clientId,
      destinationUrl: "https://funnel.example.com/apply",
      source: "YouTube",
      medium: "description",
      campaign: "main channel",
      content: "day in life",
      createdBy: "admin@example.com",
    });

  it("gives every new link a short code and counts each click", async () => {
    const res = await create();
    if (!res.ok) throw new Error("create failed");
    expect(isShortCode(res.row.shortCode ?? "")).toBe(true);
    expect(res.row.clickCount).toBe(0);

    const target = await followShortLink(res.row.shortCode!);
    expect(target).toBe(res.row.assembledUrl);
    await Promise.all([
      followShortLink(res.row.shortCode!),
      followShortLink(res.row.shortCode!),
    ]);

    const listed = (await listUtmLinks()).find((r) => r.id === res.row.id)!;
    expect(listed.clickCount).toBe(3);
    expect(listed.lastClickedAt).toBeInstanceOf(Date);
  });

  it("resolves unknown or malformed codes to nothing, counting nothing", async () => {
    expect(await followShortLink("zzzzzzz")).toBeNull();
    expect(await followShortLink("../etc")).toBeNull();
    expect(await followShortLink("")).toBeNull();
  });

  it("backfills a valid, unique code for links issued before short links", async () => {
    const a = await create();
    const b = await create();
    if (!a.ok || !b.ok) throw new Error("create failed");
    await sql`update app.utm_links set short_code = null where id in (${a.row.id}, ${b.row.id})`;

    const migration = readFileSync(
      join(process.cwd(), "drizzle", "0070_utm_short_links.sql"),
      "utf8",
    );
    const backfill = migration
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .find((part) => part.includes("UPDATE"))!;
    await sql.unsafe(backfill);

    const rows = await sql<{ short_code: string }[]>`
      select short_code from app.utm_links where id in (${a.row.id}, ${b.row.id})`;
    expect(rows.every((r) => isShortCode(r.short_code))).toBe(true);
    expect(new Set(rows.map((r) => r.short_code)).size).toBe(2);
  });

  it("the database refuses a malformed code", async () => {
    await expect(sql`
      update app.utm_links set short_code = 'Not-A-Code'
      where id = (select id from app.utm_links limit 1)`).rejects.toThrow(
      /short_code_check/,
    );
  });
});
