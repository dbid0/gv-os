/**
 * @vitest-environment node
 *
 * Lead tags and saved views against a real Postgres: a tag files once, comes
 * off every inbox of a person, the CHECKs refuse tags and emails the filters
 * could not match, and a view name is unique per offer regardless of case.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  addLeadTag,
  deleteLeadView,
  listLeadTags,
  listLeadViews,
  removeLeadTag,
  saveLeadView,
} from "@/lib/tracking/lead-tags-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("lead tags and saved views store", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function makeClient(label: string) {
    const slug = `tags-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Tags " + label}, ${slug})
      returning id`;
    return client.id as string;
  }

  it("tags once, lowercases the inbox, and removes across a person's inboxes", async () => {
    const clientId = await makeClient("tags");
    const other = await makeClient("tags-other");
    await addLeadTag(clientId, " Lead@Example.com ", "hot", "rep@example.com");
    await addLeadTag(clientId, "lead@example.com", "hot", null);
    await addLeadTag(clientId, "alias@example.com", "hot", null);
    await addLeadTag(clientId, "lead@example.com", "vip", null);
    await addLeadTag(other, "lead@example.com", "hot", null);

    const rows = (await listLeadTags(clientId)).map((r) => `${r.leadEmail}:${r.tag}`);
    expect(rows.sort()).toEqual([
      "alias@example.com:hot",
      "lead@example.com:hot",
      "lead@example.com:vip",
    ]);

    expect(
      await removeLeadTag(clientId, ["lead@example.com", "ALIAS@example.com"], "hot"),
    ).toBe(2);
    expect(await removeLeadTag(clientId, [], "hot")).toBe(0);
    expect((await listLeadTags(clientId)).map((r) => r.tag)).toEqual(["vip"]);
    // Another offer's tag is untouched.
    expect(await listLeadTags(other)).toHaveLength(1);
  });

  it("refuses tags and emails the filters could never match", async () => {
    const clientId = await makeClient("checks");
    const insert = (email: string, tag: string) => sql`
      insert into app.lead_tags (client_id, lead_email, tag) values (${clientId}, ${email}, ${tag})`;
    await expect(insert("lead@example.com", "Hot")).rejects.toThrow(
      /lead_tags_tag_check/,
    );
    await expect(insert("lead@example.com", "-hot")).rejects.toThrow(
      /lead_tags_tag_check/,
    );
    await expect(insert("Lead@example.com", "hot")).rejects.toThrow(
      /lead_tags_email_check/,
    );
    await expect(insert("no-at-sign", "hot")).rejects.toThrow(/lead_tags_email_check/);
  });

  it("keeps view names unique per offer regardless of case", async () => {
    const clientId = await makeClient("views");
    const other = await makeClient("views-other");
    const first = await saveLeadView(clientId, "Hot leads", "tag=hot", null);
    expect(first.ok).toBe(true);
    expect(await saveLeadView(clientId, "HOT LEADS", "has=paid", null)).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect((await saveLeadView(other, "Hot leads", "tag=hot", null)).ok).toBe(true);
    await saveLeadView(clientId, "applied never booked", "has=unbooked", null);

    expect((await listLeadViews(clientId)).map((v) => v.name)).toEqual([
      "applied never booked",
      "Hot leads",
    ]);

    const id = (first as { id: string }).id;
    expect(await deleteLeadView(other, id)).toBe(false);
    expect(await deleteLeadView(clientId, id)).toBe(true);
    expect(await deleteLeadView(clientId, id)).toBe(false);
    expect(await listLeadViews(clientId)).toHaveLength(1);

    await expect(sql`
      insert into app.lead_views (client_id, name) values (${clientId}, '   ')`).rejects.toThrow(
      /lead_views_name_check/,
    );
  });
});
