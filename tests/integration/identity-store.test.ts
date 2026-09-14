/**
 * @vitest-environment node
 *
 * Inbox merges against a real Postgres: the one-hop rules are checked on the
 * offer's stored alias map, merges are per offer, unmerging removes one link,
 * and same-person candidates come from rows sharing a phone or a full name.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import {
  mergeCandidatesFor,
  mergeInbox,
  unmergeInbox,
} from "@/lib/tracking/identity-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("identity store", () => {
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
    const slug = `identity-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Identity " + label}, ${slug}) returning id`;
    return client.id as string;
  }

  it("merges, refuses chains on the stored map, and unmerges one link", async () => {
    const clientId = await makeClient("rules");
    const other = await makeClient("other");

    expect(
      await mergeInbox({
        clientId,
        alias: "Pay@X.com",
        canonical: "person@x.com",
        createdBy: null,
      }),
    ).toEqual({ ok: true });
    expect(await aliasMapForClient(clientId)).toEqual(
      new Map([["pay@x.com", "person@x.com"]]),
    );
    // Per offer: the same inbox can be its own person on another offer.
    expect(await aliasMapForClient(other)).toEqual(new Map());

    expect(
      await mergeInbox({
        clientId,
        alias: "new@x.com",
        canonical: "pay@x.com",
        createdBy: null,
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("itself merged into person@x.com"),
    });
    expect(
      await mergeInbox({
        clientId,
        alias: "person@x.com",
        canonical: "elsewhere@x.com",
        createdBy: null,
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("a person of its own"),
    });
    expect(
      await mergeInbox({
        clientId,
        alias: "pay@x.com",
        canonical: "someone@x.com",
        createdBy: null,
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Unmerge it there first"),
    });

    expect(await unmergeInbox(clientId, " PAY@x.com ")).toEqual({ ok: true });
    expect(await unmergeInbox(clientId, "pay@x.com")).toEqual({
      ok: false,
      reason: "That inbox isn't merged into anyone.",
    });
    expect(await aliasMapForClient(clientId)).toEqual(new Map());
  });

  it("suggests other inboxes sharing a phone or a full name, never on a first name alone", async () => {
    const clientId = await makeClient("candidates");
    const [sync] = await sql<{ id: string }[]>`
      insert into app.client_tracking_syncs (client_id, source, spreadsheet_id)
      values (${clientId}, 'sheet', 'identity-sheet') returning id`;
    const rows: [string, string | null, string | null][] = [
      ["person@x.com", "Jordan Rivers", "+1 (555) 010-2000"],
      ["phone-twin@x.com", "J R", "555-010-2000"],
      ["name-twin@x.com", "jordan rivers", null],
      ["stranger@x.com", "Someone Else", "555-999-0000"],
      ["first-only@x.com", "Jordan", null],
    ];
    let i = 0;
    for (const [email, name, phone] of rows) {
      await sql`
        insert into app.client_tracking_rows (sync_id, client_id, tab, row_index, email, name, phone)
        values (${sync.id}, ${clientId}, 'applications', ${++i}, ${email}, ${name}, ${phone})`;
    }
    const candidates = await mergeCandidatesFor(sync.id, ["person@x.com"]);
    expect(
      candidates.map((c) => [c.email, c.sharedPhone, c.sharedName]).sort(),
    ).toEqual([
      ["name-twin@x.com", false, true],
      ["phone-twin@x.com", true, false],
    ]);

    const [lonely] = await sql<{ id: string }[]>`
      insert into app.client_tracking_syncs (client_id, source, spreadsheet_id)
      values (${clientId}, 'sheet', 'identity-sheet-2') returning id`;
    expect(await mergeCandidatesFor(lonely.id, ["person@x.com"])).toEqual([]);
  });
});
