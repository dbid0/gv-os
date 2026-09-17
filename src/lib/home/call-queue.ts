/**
 * THE REP'S CALL BOARD — the one thing a CRM is open for.
 *
 * The rep home is otherwise entirely retrospective: quota pace, streak,
 * commission owed, last week's EODs. All of it answers "how did I do". None of
 * it answers "who am I talking to next", which is the question a rep actually
 * has the app open for, and the reason a rep on a real CRM lives on one screen
 * all day.
 *
 * SCOPE IS THE OFFER, NOT THE REP, and the UI must say so. Bookings carry the
 * offer they came in under and nothing else — no scheduler we sync assigns a
 * booking to a named rep. Labelling this board "your calls" would invent an
 * assignment that does not exist anywhere in the data. It is the offer's board,
 * which for a rep who works one offer is the same list, honestly named.
 *
 * A cancelled booking is off the board. `rescheduled` marks one that moved
 * rather than died, but the new time is its own row, so keeping the old one
 * would double-book the hour.
 *
 * A booking with no start time cannot be placed on a day. Rather than dropping
 * it silently or guessing midnight, it is counted and reported, so a scheduler
 * feeding times badly shows up as a number instead of as absence.
 *
 * Pure: no database, no clock (the caller passes now and the day boundaries).
 */

export interface QueueBooking {
  id: string;
  inviteeName: string | null;
  eventType: string | null;
  /** Null when the scheduler gave no time. */
  startsAt: Date | null;
  /** booked · canceled · unknown */
  status: string;
}

export interface QueuedCall {
  id: string;
  /** The invitee, or null — never a placeholder name. */
  name: string | null;
  eventType: string | null;
  startsAt: Date;
  /** True once the call's start time has passed. */
  started: boolean;
}

export interface CallQueue {
  /** Today's calls, earliest first. */
  today: QueuedCall[];
  /** The next call that has not started, today or later. Null if none. */
  next: QueuedCall | null;
  /** Calls after today that are still to come. */
  upcoming: number;
  /** Booked calls the scheduler gave no time for. */
  undated: number;
}

const CANCELLED = "canceled";

export function callQueue(
  bookings: QueueBooking[],
  now: Date,
  /** Day boundaries in the viewer's zone, computed by the caller. */
  dayStart: Date,
  dayEnd: Date,
): CallQueue {
  const live = bookings.filter((b) => b.status.trim().toLowerCase() !== CANCELLED);

  const undated = live.filter((b) => b.startsAt === null).length;
  const dated = live
    .filter((b): b is QueueBooking & { startsAt: Date } => b.startsAt !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const toCall = (b: QueueBooking & { startsAt: Date }): QueuedCall => ({
    id: b.id,
    name: b.inviteeName,
    eventType: b.eventType,
    startsAt: b.startsAt,
    started: b.startsAt.getTime() <= now.getTime(),
  });

  const today = dated
    .filter(
      (b) =>
        b.startsAt.getTime() >= dayStart.getTime() &&
        b.startsAt.getTime() < dayEnd.getTime(),
    )
    .map(toCall);

  // The next call can be later today or on a later day — a rep opening this at
  // 6pm with nothing left today still wants to know what tomorrow starts with.
  const next = dated.find((b) => b.startsAt.getTime() > now.getTime());

  const upcoming = dated.filter((b) => b.startsAt.getTime() >= dayEnd.getTime()).length;

  return {
    today,
    next: next ? toCall(next) : null,
    upcoming,
    undated,
  };
}
