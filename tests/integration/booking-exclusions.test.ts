/**
 * @vitest-environment node
 *
 * Booking exclusions against a real Postgres: excluding takes a booking out
 * of the counted reads (the shared SQL condition), restoring puts it back,
 * another offer's booking can't be excluded, and a booking deleted upstream
 * takes its exclusion with it.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { bookings } from "@/db/schema/app";
import {
  bookingNotExcluded,
  excludeBooking,
  excludedBookingIds,
  listExcludedBookings,
  restoreBooking,
} from "@/lib/bookings/exclusions-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("booking exclusions store", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function makeClientWithBookings(label: string, n: number) {
    const slug = `excl-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Excl " + label}, ${slug}) returning id`;
    const [integration] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('calendly', 'excl test', ${client.id}, 'connected') returning id`;
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const [b] = await sql<{ id: string }[]>`
        insert into app.bookings (integration_id, provider, external_id, client_id, invitee_email, starts_at)
        values (${integration.id}, 'calendly', ${crypto.randomUUID()}, ${client.id}, ${`p${i}@example.com`}, now())
        returning id`;
      ids.push(b.id);
    }
    return { clientId: client.id, ids };
  }

  const countedIds = async (clientId: string) =>
    (
      await getDb()
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.clientId, clientId), bookingNotExcluded))
    )
      .map((r) => r.id)
      .sort();

  it("excludes from counted reads, lists the bin, and restores", async () => {
    const { clientId, ids } = await makeClientWithBookings("main", 3);
    const other = await makeClientWithBookings("other", 1);

    expect(
      await excludeBooking(clientId, ids[0], "Test booking", "ops@example.com"),
    ).toEqual({
      ok: true,
    });
    expect(await excludeBooking(clientId, ids[0], "Again", null)).toEqual({ ok: true });
    expect(await excludeBooking(clientId, other.ids[0], "Not mine", null)).toEqual({
      ok: false,
      reason: "not_found",
    });

    expect(await countedIds(clientId)).toEqual([ids[1], ids[2]].sort());
    expect([...(await excludedBookingIds(clientId))]).toEqual([ids[0]]);
    const bin = await listExcludedBookings(clientId);
    expect(bin).toHaveLength(1);
    expect(bin[0]).toMatchObject({
      bookingId: ids[0],
      inviteeEmail: "p0@example.com",
      reason: "Test booking",
      excludedBy: "ops@example.com",
    });
    // Another offer's reads are untouched.
    expect(await countedIds(other.clientId)).toEqual(other.ids);

    expect(await restoreBooking(other.clientId, ids[0])).toBe(false);
    expect(await restoreBooking(clientId, ids[0])).toBe(true);
    expect(await restoreBooking(clientId, ids[0])).toBe(false);
    expect(await countedIds(clientId)).toEqual([...ids].sort());
  });

  it("refuses a blank reason and cascades when the booking goes", async () => {
    const { clientId, ids } = await makeClientWithBookings("cascade", 1);
    await expect(sql`
      insert into app.booking_exclusions (client_id, booking_id, reason) values (${clientId}, ${ids[0]}, '  ')`).rejects.toThrow(
      /booking_exclusions_reason_check/,
    );
    await excludeBooking(clientId, ids[0], "Duplicate", null);
    await sql`delete from app.bookings where id = ${ids[0]}`;
    expect(await listExcludedBookings(clientId)).toEqual([]);
  });
});
