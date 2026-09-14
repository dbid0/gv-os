/**
 * @vitest-environment node
 *
 * Bookings stay current against a real Postgres. Before this, capture used
 * onConflictDoNothing: a call booked and later cancelled or moved stayed
 * "booked" forever. Now a re-pull or a later webhook refreshes status and time,
 * a pull that didn't fetch the invitee never erases a stored email, and an
 * identical re-pull writes nothing.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { captureBookingWebhook, storeBooking } from "@/lib/bookings/capture";
import type { NormalizedBooking } from "@/lib/bookings/normalize";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("bookings capture stays current", () => {
  let sql: postgres.Sql;
  let conn: { id: string; provider: string; clientId: string };

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const slug = `bookings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Bookings', ${slug}) returning id`;
    const [integration] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('iclosed', 'bookings test', ${client.id}, 'connected') returning id`;
    conn = { id: integration.id, provider: "iclosed", clientId: client.id };
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  const booking = (extra: Partial<NormalizedBooking> = {}): NormalizedBooking => ({
    externalId: `call-${Math.random().toString(36).slice(2, 10)}`,
    eventType: "Strategy call",
    inviteeName: "Lead Person",
    inviteeEmail: "lead@example.com",
    status: "booked",
    rescheduled: false,
    startsAt: "2026-09-20T15:00:00.000Z",
    bookedAt: "2026-09-10T12:00:00.000Z",
    ...extra,
  });

  const read = async (externalId: string) =>
    (
      await sql<
        {
          status: string;
          rescheduled: boolean;
          invitee_email: string | null;
          starts_at: Date;
          raw: Record<string, unknown>;
        }[]
      >`select status, rescheduled, invitee_email, starts_at, raw from app.bookings
        where provider = ${conn.provider} and external_id = ${externalId}`
    )[0];

  it("refreshes a booked call that is later cancelled and moved", async () => {
    const first = booking();
    expect(await storeBooking(conn, first, { v: 1 })).toBe("new");
    expect(await storeBooking(conn, first, { v: 1 })).toBe("unchanged");

    const cancelled = {
      ...first,
      status: "canceled",
      rescheduled: true,
      startsAt: "2026-09-22T18:00:00.000Z",
    };
    expect(await storeBooking(conn, cancelled, { v: 2 })).toBe("updated");
    const row = await read(first.externalId);
    expect(row).toMatchObject({ status: "canceled", rescheduled: true, raw: { v: 2 } });
    expect(row.starts_at.toISOString()).toBe("2026-09-22T18:00:00.000Z");
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from app.bookings where external_id = ${first.externalId}`;
    expect(count).toBe(1);
  });

  it("never erases a stored invitee when a pull didn't fetch one", async () => {
    const first = booking();
    await storeBooking(conn, first, {});
    expect(
      await storeBooking(conn, { ...first, inviteeEmail: null, inviteeName: null }, {}),
    ).toBe("unchanged");
    expect((await read(first.externalId)).invitee_email).toBe("lead@example.com");
  });

  it("fills an invitee that the first capture didn't have", async () => {
    const bare = booking({ inviteeEmail: null, inviteeName: null });
    await storeBooking(conn, bare, {});
    expect(
      await storeBooking(conn, { ...bare, inviteeEmail: "late@example.com" }, {}),
    ).toBe("updated");
    expect((await read(bare.externalId)).invitee_email).toBe("late@example.com");
  });

  it("a later webhook for a known booking updates it instead of being dropped", async () => {
    const id = `hook-${Math.random().toString(36).slice(2, 10)}`;
    expect(
      await captureBookingWebhook(conn, {
        id,
        event: "booking.created",
        email: "w@example.com",
      }),
    ).toEqual({ captured: true, reason: "new" });
    expect(
      await captureBookingWebhook(conn, {
        id,
        event: "booking.created",
        email: "w@example.com",
      }),
    ).toEqual({ captured: false, reason: "duplicate" });
    expect(
      await captureBookingWebhook(conn, {
        id,
        event: "booking.cancelled",
        email: "w@example.com",
      }),
    ).toEqual({ captured: false, reason: "updated" });
    expect((await read(id)).status).toBe("canceled");
    expect(await captureBookingWebhook(conn, { nothing: true })).toEqual({
      captured: false,
      reason: "unparseable",
    });
  });
});
