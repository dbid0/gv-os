/**
 * STUCK CALLS — the date passed and nobody said what happened.
 *
 * A booked call whose start time is comfortably in the past, never
 * cancelled, and with no end-of-call report filed for the invitee is a hole
 * in the record: maybe it happened and nobody wrote it down, maybe it never
 * happened at all. Either way it is the floor's cheapest fix, so it gets its
 * own tile instead of hiding inside "booked".
 *
 * Pure matcher: bookings in, stuck list out. The one-hour grace stops a call
 * that JUST ended from being nagged while the closer types the report.
 */

export interface StuckCandidate {
  /** The booking's id when the caller has it — lets a stuck call be acted on. */
  id?: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  startsAt: Date | null;
  status: string;
}

export interface StuckCall {
  /** The booking this stuck call is, or null when the caller didn't pass ids. */
  bookingId: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  startsAt: Date;
  hoursOverdue: number;
}

const GRACE_MS = 60 * 60 * 1000;
const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export function stuckCalls(
  bookings: StuckCandidate[],
  /** Emails with an end-of-call report on file (lowercased). */
  reportedEmails: Set<string>,
  now: Date,
): StuckCall[] {
  const nowMs = now.getTime();
  return bookings
    .filter((b) => {
      if (b.status !== "booked" || !b.startsAt) return false;
      const t = b.startsAt.getTime();
      if (t > nowMs - GRACE_MS) return false; // not past, or inside the grace
      if (t < nowMs - HORIZON_MS) return false; // ancient history, not ops
      const email = b.inviteeEmail?.trim().toLowerCase();
      if (email && reportedEmails.has(email)) return false; // outcome exists
      return true;
    })
    .map((b) => ({
      bookingId: b.id ?? null,
      inviteeName: b.inviteeName,
      inviteeEmail: b.inviteeEmail,
      startsAt: b.startsAt as Date,
      hoursOverdue: Math.floor((nowMs - (b.startsAt as Date).getTime()) / 3_600_000),
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
