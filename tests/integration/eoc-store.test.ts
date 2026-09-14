/**
 * @vitest-environment node
 *
 * End-of-call reports against a real Postgres: the CHECKs refuse rows the
 * counters could not read, a submission key files once, a booking carries one
 * active report (enforced by the partial unique index, not only the app), and
 * void/restore move a report in and out of every read.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import type { CleanEoc } from "@/lib/calls/eoc-form";
import {
  activeEocReports,
  fileEoc,
  listEocReports,
  restoreEoc,
  voidEoc,
} from "@/lib/calls/eoc-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

const noShow: CleanEoc = {
  leadEmail: "lead@example.com",
  paymentEmail: null,
  outcome: "no_show",
  closeType: null,
  cashCollectedCents: null,
  contractValueCents: null,
  closerRepId: null,
  setterRepId: null,
  recordingUrl: null,
  notes: null,
};

const closed: CleanEoc = {
  ...noShow,
  outcome: "closed",
  closeType: "pif",
  cashCollectedCents: 600_000,
  contractValueCents: 600_000,
};

describe.skipIf(!databaseUrl)("end-of-call reports store", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const key = () => crypto.randomUUID();

  async function makeClient(label: string) {
    const slug = `eoc-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"EOC " + label}, ${slug})
      returning id`;
    return client.id as string;
  }

  async function makeBooking(clientId: string, email = "lead@example.com") {
    const [integration] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('calendly', 'eoc test', ${clientId}, 'connected') returning id`;
    const [booking] = await sql<{ id: string }[]>`
      insert into app.bookings (integration_id, provider, external_id, client_id, invitee_email, starts_at)
      values (${integration.id}, 'calendly', ${key()}, ${clientId}, ${email}, now() - interval '2 hours')
      returning id`;
    return booking.id as string;
  }

  it("files once per submission key", async () => {
    const clientId = await makeClient("idem");
    const submissionKey = key();
    const input = {
      clientId,
      bookingId: null,
      eoc: noShow,
      callAt: new Date(),
      submissionKey,
      submittedBy: "closer@example.com",
    };
    const first = await fileEoc(input);
    const again = await fileEoc(input);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(again).toEqual({
      ok: true,
      id: (first as { id: string }).id,
      replayed: true,
    });
    expect(await listEocReports(clientId, { voided: false })).toHaveLength(1);
  });

  it("gives a booking one active report, and refuses another client's booking", async () => {
    const clientId = await makeClient("booking");
    const other = await makeClient("other");
    const bookingId = await makeBooking(clientId);

    const base = { clientId, bookingId, callAt: new Date(), submittedBy: null };
    const first = await fileEoc({ ...base, eoc: noShow, submissionKey: key() });
    expect(first.ok).toBe(true);
    expect(await fileEoc({ ...base, eoc: closed, submissionKey: key() })).toEqual({
      ok: false,
      reason: "booking_has_report",
    });
    expect(
      await fileEoc({ ...base, clientId: other, eoc: closed, submissionKey: key() }),
    ).toEqual({ ok: false, reason: "booking_not_found" });

    // The database enforces it too, not just the store's pre-check.
    await expect(sql`
      insert into app.call_eoc_reports (client_id, booking_id, lead_email, outcome, call_at, submission_key)
      values (${clientId}, ${bookingId}, 'lead@example.com', 'no_show', now(), ${key()})`).rejects.toThrow(
      /call_eoc_reports_active_booking_key/,
    );
  });

  it("void takes a report out of every read; restore brings it back", async () => {
    const clientId = await makeClient("void");
    const bookingId = await makeBooking(clientId);
    const filed = await fileEoc({
      clientId,
      bookingId,
      eoc: closed,
      callAt: new Date("2026-09-10T15:00:00Z"),
      submissionKey: key(),
      submittedBy: null,
    });
    const id = (filed as { id: string }).id;
    expect(await activeEocReports(clientId)).toEqual([
      {
        email: "lead@example.com",
        status: "closed won",
        outcome: null,
        occurredAt: new Date("2026-09-10T15:00:00Z"),
      },
    ]);

    const other = await makeClient("void-other");
    expect(await voidEoc(other, id, "x")).toBe(false);
    expect(await voidEoc(clientId, id, "manager@example.com")).toBe(true);
    expect(await voidEoc(clientId, id, "manager@example.com")).toBe(false);
    expect(await activeEocReports(clientId)).toEqual([]);
    const bin = await listEocReports(clientId, { voided: true });
    expect(bin).toHaveLength(1);
    expect(bin[0]).toMatchObject({ voidedBy: "manager@example.com", closeType: "pif" });

    // While voided, the booking is free for a corrected report.
    const corrected = await fileEoc({
      clientId,
      bookingId,
      eoc: noShow,
      callAt: new Date(),
      submissionKey: key(),
      submittedBy: null,
    });
    expect(corrected.ok).toBe(true);
    // ...so the old one can't come back on top of it.
    expect(await restoreEoc(clientId, id)).toEqual({
      ok: false,
      reason: "booking_has_report",
    });

    await voidEoc(clientId, (corrected as { id: string }).id, null);
    expect(await restoreEoc(other, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await restoreEoc(clientId, id)).toEqual({ ok: true });
    expect(await activeEocReports(clientId)).toHaveLength(1);
  });

  it("refuses rows the counters could not read", async () => {
    const clientId = await makeClient("checks");
    const insert = (cols: {
      outcome: string;
      closeType?: string | null;
      cash?: number | null;
      contract?: number | null;
      email?: string;
    }) => sql`
      insert into app.call_eoc_reports
        (client_id, lead_email, outcome, close_type, cash_collected_cents, contract_value_cents, call_at, submission_key)
      values (${clientId}, ${cols.email ?? "lead@example.com"}, ${cols.outcome}, ${cols.closeType ?? null},
        ${cols.cash ?? null}, ${cols.contract ?? null}, now(), ${key()})`;

    await expect(insert({ outcome: "ghosted" })).rejects.toThrow(/outcome_check/);
    await expect(
      insert({ outcome: "closed", closeType: "barter", cash: 1, contract: 1 }),
    ).rejects.toThrow(/close_type_check/);
    await expect(insert({ outcome: "no_show", contract: 100 })).rejects.toThrow(
      /close_fields_check/,
    );
    await expect(insert({ outcome: "closed", closeType: "pif" })).rejects.toThrow(
      /closed_needs_value_check/,
    );
    await expect(
      insert({ outcome: "closed", closeType: "pif", cash: -1, contract: 100 }),
    ).rejects.toThrow(/money_nonnegative_check/);
    await expect(
      insert({ outcome: "closed", closeType: "pif", cash: 101, contract: 100 }),
    ).rejects.toThrow(/cash_within_contract_check/);
    await expect(insert({ outcome: "no_show", email: "not-an-email" })).rejects.toThrow(
      /email_check/,
    );
    await expect(
      insert({ outcome: "closed", closeType: "deposit", cash: 0, contract: 100 }),
    ).resolves.toBeDefined();
  });
});
