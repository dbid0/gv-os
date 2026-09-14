/**
 * @vitest-environment node
 *
 * `leadByEmail` against a real Postgres: every inbox that is the same person
 * merges into ONE journey. The builder groups rows by email, so before the fix
 * each alias inbox became its own summary and only the first one reached the
 * page — a person who booked from one inbox and paid from another showed
 * half their history. Extra rows (reports filed in GV OS) merge in too, but
 * only for this person's inboxes.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import type { LeadEventInput } from "@/lib/tracking/leads";
import { leadByEmail, leadsForClient } from "@/lib/tracking/queries";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

function extra(email: string, status: string): LeadEventInput {
  return {
    tab: "eoc",
    rowIndex: 1_000_000,
    occurredAt: new Date("2026-09-12T15:00:00Z"),
    email,
    name: null,
    rep: null,
    status,
    outcome: null,
    cashCents: null,
    revenueCents: null,
    recordingUrl: null,
    notes: null,
    payload: {},
  };
}

describe.skipIf(!databaseUrl)("leadByEmail", () => {
  let sql: postgres.Sql;
  let syncId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const slug = `lead-by-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Lead Join', ${slug}) returning id`;
    const [sync] = await sql<{ id: string }[]>`
      insert into app.client_tracking_syncs (client_id, source, spreadsheet_id)
      values (${client.id}, 'sheet', 'lead-join-sheet') returning id`;
    syncId = sync.id;
    const rows: [string, string, number, string | null, number | null][] = [
      ["applications", "booked@example.com", 1, null, null],
      ["calls", "booked@example.com", 2, "booked", null],
      ["payments", "paid@example.com", 3, "succeeded", 99_700],
      ["applications", "someone-else@example.com", 4, null, null],
    ];
    for (const [tab, email, rowIndex, status, cash] of rows) {
      await sql`
        insert into app.client_tracking_rows (sync_id, client_id, tab, row_index, email, status, cash_cents, occurred_at)
        values (${syncId}, ${client.id}, ${tab}, ${rowIndex}, ${email}, ${status}, ${cash}, ${new Date(`2026-09-0${rowIndex}T10:00:00Z`)})`;
    }
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  it("merges every alias inbox into one journey under the canonical email", async () => {
    const lead = await leadByEmail(syncId, "Booked@Example.com", ["paid@example.com"]);
    expect(lead).not.toBeNull();
    expect(lead!.email).toBe("booked@example.com");
    expect(lead!.events.map((e) => e.tab)).toEqual([
      "applications",
      "calls",
      "payments",
    ]);
    expect(lead!.applied).toBe(true);
    expect(lead!.callsBooked).toBe(1);
    expect(lead!.paymentsCents).toBe(99_700);
  });

  it("merges in extra rows for this person only", async () => {
    const lead = await leadByEmail(
      syncId,
      "booked@example.com",
      [],
      [
        extra("booked@example.com", "closed won"),
        extra("someone-else@example.com", "no show"),
      ],
    );
    expect(lead!.eocReports).toBe(1);
    expect(lead!.latestStatus).toBe("closed won");
  });

  it("returns null for a person with no rows", async () => {
    expect(await leadByEmail(syncId, "nobody@example.com")).toBeNull();
    expect(await leadByEmail(syncId, "   ")).toBeNull();
  });

  it("the list view carries extra rows as their own leads when no sheet row exists", async () => {
    const leads = await leadsForClient(syncId, [extra("new@example.com", "no show")]);
    const added = leads.find((l) => l.email === "new@example.com");
    expect(added).toMatchObject({ eocReports: 1, applied: false });
    expect(leads.find((l) => l.email === "someone-else@example.com")).toBeDefined();
  });
});
