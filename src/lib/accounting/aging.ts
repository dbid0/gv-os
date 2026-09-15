import { BUSINESS_TIME_ZONE, dayKeyIn } from "@/lib/time/zone";

/**
 * AR aging — pure. The mirror stores close dates as literal `yyyy-mm-dd`
 * sheet strings; "days outstanding" compares that calendar date with today's
 * CT business day. Both sides are anchored to noon UTC so DST shifts can
 * never move a day boundary.
 */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utcNoon(key: string): number | null {
  const m = DAY_RE.exec(key.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/** Whole days from a yyyy-mm-dd close date to `now`'s CT day. Null on junk. */
export function daysSinceClose(
  dateClosed: string,
  now: Date,
  /** Whose "today" the days are counted to — the viewer's zone. */
  timeZone: string = BUSINESS_TIME_ZONE,
): number | null {
  const closed = utcNoon(dateClosed);
  if (closed === null) return null;
  // dayKeyIn always yields a valid yyyy-mm-dd, so this side can't be null.
  const today = utcNoon(dayKeyIn(now, timeZone)) as number;
  return Math.round((today - closed) / DAY_MS);
}

export type AgingTone = "fresh" | "watch" | "overdue";

/** >60 days = overdue (red), >30 = watch (amber), else fresh. */
export function agingTone(days: number | null): AgingTone {
  if (days === null) return "fresh";
  if (days > 60) return "overdue";
  if (days > 30) return "watch";
  return "fresh";
}
