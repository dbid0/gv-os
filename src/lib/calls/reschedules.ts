/**
 * THE RESCHEDULE TRAIL — where a moved call went, and why a call was called off.
 *
 * A calendar records a reschedule as two bookings: the old one cancelled and
 * flagged as moved, and a brand-new one at the new time. Nothing links them,
 * so the call log showed "Rescheduled" with no way to see to when. This pairs
 * them from what is stored:
 *
 * - The move is the same invitee's next booking CREATED strictly after the old booking
 *   was, and no later than the old call's start — a reschedule happens before
 *   the call it replaces. The earliest-created such booking wins.
 * - Each new booking is the destination of at most one move, and old bookings
 *   are paired oldest first, so a call moved twice reads as a chain.
 * - With no qualifying booking the move stays unpaired ("Rescheduled", no
 *   date) rather than guessing at an unrelated later call.
 *
 * Pure: no database.
 */

export type TrailBooking = {
  id: string;
  inviteeEmail: string | null;
  status: string;
  rescheduled?: boolean;
  startsAt: Date | null;
  bookedAt?: Date | null;
};

export type TrailLink = { bookingId: string; startsAt: Date | null };

export type Trail = { movedTo: TrailLink | null; movedFrom: TrailLink | null };

const emailOf = (b: TrailBooking) => b.inviteeEmail?.trim().toLowerCase() || null;

export function rescheduleTrail(bookings: TrailBooking[]): Map<string, Trail> {
  const trail = new Map<string, Trail>();
  const get = (id: string) => {
    const t = trail.get(id) ?? { movedTo: null, movedFrom: null };
    trail.set(id, t);
    return t;
  };

  const byEmail = new Map<string, TrailBooking[]>();
  for (const b of bookings) {
    const email = emailOf(b);
    if (!email || !b.bookedAt) continue;
    byEmail.set(email, [...(byEmail.get(email) ?? []), b]);
  }

  const moved = bookings
    .filter(
      (b) =>
        b.rescheduled === true && b.status === "canceled" && emailOf(b) && b.bookedAt,
    )
    .sort((a, b) => (a.bookedAt as Date).getTime() - (b.bookedAt as Date).getTime());

  const claimed = new Set<string>();
  for (const old of moved) {
    const from = (old.bookedAt as Date).getTime();
    const until = old.startsAt?.getTime() ?? Infinity;
    const next = (byEmail.get(emailOf(old) as string) as TrailBooking[])
      .filter((c) => {
        if (c.id === old.id || claimed.has(c.id)) return false;
        const at = (c.bookedAt as Date).getTime();
        return at > from && at <= until;
      })
      .sort(
        (a, b) => (a.bookedAt as Date).getTime() - (b.bookedAt as Date).getTime(),
      )[0];
    if (!next) continue;
    claimed.add(next.id);
    get(old.id).movedTo = { bookingId: next.id, startsAt: next.startsAt };
    get(next.id).movedFrom = { bookingId: old.id, startsAt: old.startsAt };
  }
  return trail;
}

/** A calendar's cancellation reason, tidied for one line; null when there's none. */
export function cleanCancelReason(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
}
