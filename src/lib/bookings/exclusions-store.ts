import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookingExclusions, bookings } from "@/db/schema/app";

/**
 * The SQL condition the counted-booking reads add (stuck calls, the offer
 * metrics' confirmation and show/close rates): the booking has not been taken
 * out of the numbers. One fragment so those reads can't drift apart; the call
 * log filters the same set in code (see excludedBookingIds).
 */
export const bookingNotExcluded = sql`not exists (
  select 1 from ${bookingExclusions}
  where ${bookingExclusions.bookingId} = ${bookings.id}
)`;

/** The ids of this offer's excluded bookings. */
export async function excludedBookingIds(clientId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ bookingId: bookingExclusions.bookingId })
    .from(bookingExclusions)
    .where(eq(bookingExclusions.clientId, clientId));
  return new Set(rows.map((r) => r.bookingId));
}

/**
 * Take one of this offer's bookings out of the numbers. Refused for a booking
 * on another offer; excluding an already-excluded booking is a no-op.
 */
export async function excludeBooking(
  clientId: string,
  bookingId: string,
  reason: string,
  by: string | null,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const db = getDb();
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, clientId)))
    .limit(1);
  if (!booking) return { ok: false, reason: "not_found" };
  await db
    .insert(bookingExclusions)
    .values({ clientId, bookingId, reason, excludedBy: by })
    .onConflictDoNothing({ target: [bookingExclusions.bookingId] });
  return { ok: true };
}

/** Put a booking back into the numbers. */
export async function restoreBooking(
  clientId: string,
  bookingId: string,
): Promise<boolean> {
  const rows = await getDb()
    .delete(bookingExclusions)
    .where(
      and(
        eq(bookingExclusions.clientId, clientId),
        eq(bookingExclusions.bookingId, bookingId),
      ),
    )
    .returning({ id: bookingExclusions.id });
  return rows.length > 0;
}

export type ExcludedBookingRow = {
  bookingId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  startsAt: Date | null;
  provider: string;
  reason: string;
  excludedBy: string | null;
  excludedAt: Date;
};

/** The restore bin: this offer's excluded bookings, most recently excluded first. */
export async function listExcludedBookings(
  clientId: string,
  limit = 50,
): Promise<ExcludedBookingRow[]> {
  return getDb()
    .select({
      bookingId: bookings.id,
      inviteeName: bookings.inviteeName,
      inviteeEmail: bookings.inviteeEmail,
      startsAt: bookings.startsAt,
      provider: bookings.provider,
      reason: bookingExclusions.reason,
      excludedBy: bookingExclusions.excludedBy,
      excludedAt: bookingExclusions.createdAt,
    })
    .from(bookingExclusions)
    .innerJoin(bookings, eq(bookings.id, bookingExclusions.bookingId))
    .where(eq(bookingExclusions.clientId, clientId))
    .orderBy(desc(bookingExclusions.createdAt))
    .limit(limit);
}
