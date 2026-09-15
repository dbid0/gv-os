/**
 * TIMEZONES — whose calendar a date is counted on.
 *
 * Two clocks, never mixed:
 * - The VIEWER's timezone decides what "today", "this week" and "this month"
 *   mean on screen, which day a timestamped event (a payment, a call, a
 *   close) is counted under, and how times are shown. Two people in different
 *   timezones each see counters on their own calendar.
 * - The BUSINESS timezone stamps dates that get STORED or reconciled — a
 *   ledger entry's day, a payout run's month, the deal sheet's timestamp,
 *   scheduled alerts. Those must not move depending on who clicked.
 *
 * The browser reports the viewer's zone once (a cookie); until it has, the
 * business zone is the fallback. Pure.
 */

export const BUSINESS_TIME_ZONE = "America/Chicago";

/** A real IANA timezone name, or null. */
export function normalizeTimeZone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tz = raw.trim();
  if (tz === "" || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

/** A moment's calendar day (yyyy-mm-dd) in a timezone. */
export function dayKeyIn(d: Date, timeZone: string): string {
  return d.toLocaleDateString("en-CA", { timeZone });
}

/** A short label for the zone, e.g. "CDT" or "GMT+8", for "times shown in …". */
export function zoneAbbreviation(at: Date, timeZone: string): string {
  // formatToParts with timeZoneName always yields that part.
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName") as Intl.DateTimeFormatPart;
  return part.value;
}

export const VIEWER_TZ_COOKIE = "gv-tz";

/** How far a timezone's wall clock is ahead of UTC at a moment, in ms. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) =>
    Number((parts.find((p) => p.type === type) as Intl.DateTimeFormatPart).value);
  const wall = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The first moment of a calendar day (yyyy-mm-dd) in a timezone. */
export function dayStartIn(dayKey: string, timeZone: string): Date {
  const m = DAY_RE.exec(dayKey);
  if (!m) throw new Error(`Not a day key: ${dayKey}`);
  const wallMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Two passes: the offset at a first guess, then at the corrected instant, so
  // a DST change on that day still lands on the real local midnight.
  let at = wallMidnight - offsetMs(new Date(wallMidnight), timeZone);
  at = wallMidnight - offsetMs(new Date(at), timeZone);
  return new Date(at);
}

/** The last millisecond of a calendar day in a timezone. */
export function dayEndIn(dayKey: string, timeZone: string): Date {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(dayStartIn(next, timeZone).getTime() - 1);
}
