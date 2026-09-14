/**
 * KEEPING A BOOKING CURRENT — what a fresh pull may change on a stored booking.
 *
 * Bookings used to be written once and never again: a call that was booked,
 * then cancelled or moved, stayed "booked" in GV OS forever — a phantom stuck
 * call, an inflated upcoming count, a cancelled call counted as held. The
 * provider is the truth about a booking's CURRENT state, so each pull now
 * refreshes it — under rules that never lose what is already known:
 *
 * - status, start time, event type and the reschedule flag follow the
 *   provider, except that an "unknown" status or a missing value never
 *   replaces a known one;
 * - the invitee's name and email are only ever filled in, never erased —
 *   a pull that didn't fetch the invitee must not blank out the one we have.
 *
 * Pure: no database.
 */

import type { NormalizedBooking } from "@/lib/bookings/normalize";

export type StoredBooking = {
  eventType: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  status: string;
  rescheduled: boolean;
  startsAt: Date | null;
  bookedAt: Date | null;
};

export type BookingWrite = {
  values: StoredBooking;
  change: "new" | "updated" | "unchanged";
};

const toDate = (iso: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const timeOf = (d: Date | null): number | null => (d ? d.getTime() : null);
const sameTime = (a: Date | null, b: Date | null) => timeOf(a) === timeOf(b);

export function bookingWrite(
  existing: StoredBooking | null,
  incoming: NormalizedBooking,
): BookingWrite {
  const fresh: StoredBooking = {
    eventType: incoming.eventType,
    inviteeName: incoming.inviteeName,
    inviteeEmail: incoming.inviteeEmail,
    status: incoming.status,
    rescheduled: incoming.rescheduled,
    startsAt: toDate(incoming.startsAt),
    bookedAt: toDate(incoming.bookedAt),
  };
  if (!existing) return { values: fresh, change: "new" };

  const values: StoredBooking = {
    eventType: fresh.eventType ?? existing.eventType,
    inviteeName: existing.inviteeName ?? fresh.inviteeName,
    inviteeEmail: existing.inviteeEmail ?? fresh.inviteeEmail,
    status: fresh.status === "unknown" ? existing.status : fresh.status,
    rescheduled: fresh.rescheduled || existing.rescheduled,
    startsAt: fresh.startsAt ?? existing.startsAt,
    bookedAt: existing.bookedAt ?? fresh.bookedAt,
  };
  const changed =
    values.eventType !== existing.eventType ||
    values.inviteeName !== existing.inviteeName ||
    values.inviteeEmail !== existing.inviteeEmail ||
    values.status !== existing.status ||
    values.rescheduled !== existing.rescheduled ||
    !sameTime(values.startsAt, existing.startsAt) ||
    !sameTime(values.bookedAt, existing.bookedAt);
  return { values, change: changed ? "updated" : "unchanged" };
}

/** Whether a Calendly event still needs its invitee fetched. */
export function needsInvitee(existingEmail: string | null | undefined): boolean {
  return !existingEmail;
}

/**
 * The invitee to attach to an event: the active one if any, else the most
 * recently updated (a cancelled event's invitees are all cancelled).
 */
export function pickInvitee(
  invitees: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const active = invitees.find((i) => i.status === "active");
  if (active) return active;
  return [...invitees].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
  )[0];
}
