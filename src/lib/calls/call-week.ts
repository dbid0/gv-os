/**
 * THE CALL CALENDAR — one week of the call log, laid out day by day.
 *
 * The list view answers "what happened"; a closer planning their week needs
 * "what does Thursday look like". This lays the same call-log rows onto a
 * Sunday-first week on the viewer's calendar — the same day keys the list groups by, so
 * a call never sits on a different day in the two views.
 *
 * - The week is chosen by any date inside it (`?week=YYYY-MM-DD`); anything
 *   unreadable falls back to the week holding today.
 * - Each day's calls run earliest first. Undated calls can't be placed on a
 *   calendar, so they are counted apart (the list view still shows them).
 *
 * Pure: today's key is passed in; no database.
 */

import { callDayKey, type CallLogRow } from "@/lib/calls/call-log";

export type WeekDay = { dateKey: string; isToday: boolean; rows: CallLogRow[] };

export type CallWeek = {
  /** The Sunday that starts the week, YYYY-MM-DD. */
  weekKey: string;
  prevKey: string;
  nextKey: string;
  days: WeekDay[];
  /** Calls with no start time, which no calendar can place. */
  undated: number;
};

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** A real calendar date from a YYYY-MM-DD key, or null (2026-02-30 is null). */
function parseKey(key: string): Date | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return keyOf(d) === key ? d : null;
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** The Sunday on or before the given day. */
function sundayOf(d: Date): Date {
  return addDays(d, -d.getUTCDay());
}

/** The week to show: the one holding `wanted` when it is a real date, else today's. */
export function weekKeyFor(wanted: string | undefined, todayKey: string): string {
  const d = (wanted && parseKey(wanted)) || (parseKey(todayKey) as Date);
  return keyOf(sundayOf(d));
}

export function callWeek(
  rows: CallLogRow[],
  weekKey: string,
  todayKey: string,
  timeZone: string,
): CallWeek {
  const start = sundayOf(parseKey(weekKey) as Date);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const dateKey = keyOf(addDays(start, i));
    return { dateKey, isToday: dateKey === todayKey, rows: [] };
  });
  const byKey = new Map(days.map((d) => [d.dateKey, d]));

  let undated = 0;
  for (const r of rows) {
    if (!r.startsAt) {
      undated += 1;
      continue;
    }
    byKey.get(callDayKey(r.startsAt, timeZone))?.rows.push(r);
  }
  for (const d of days) {
    d.rows.sort(
      (a, b) => (a.startsAt as Date).getTime() - (b.startsAt as Date).getTime(),
    );
  }

  return {
    weekKey: keyOf(start),
    prevKey: keyOf(addDays(start, -7)),
    nextKey: keyOf(addDays(start, 7)),
    days,
    undated,
  };
}
