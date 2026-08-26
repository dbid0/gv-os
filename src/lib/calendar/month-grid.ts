/**
 * Month-grid geometry for the Calendar section — pure so the layout is testable
 * and never drifts. Given a year, a 1-based month, and today's day key, it
 * returns the weeks (Sunday-first) that cover the month, each a run of 7 cells.
 * Leading/trailing cells from the neighbouring months are marked out-of-month.
 *
 * All date math is UTC on calendar dates (no wall-clock), so a cell's key is a
 * plain YYYY-MM-DD independent of the viewer's timezone.
 */

export interface DayCell {
  /** YYYY-MM-DD. */
  dateKey: string;
  /** Day of the month, 1-31. */
  day: number;
  /** True when the cell belongs to the displayed month. */
  inMonth: boolean;
  /** True when the cell is today (matches the supplied todayKey). */
  isToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;

export function monthGrid(year: number, month: number, todayKey: string): DayCell[][] {
  // Sunday on or before the 1st of the month.
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstDow));

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const dateKey = keyOf(y, mo, day);
    cells.push({
      dateKey,
      day,
      inMonth: mo === month && y === year,
      isToday: dateKey === todayKey,
    });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
  // Trailing rows that are entirely next-month are noise — drop them all (a
  // month starting on a Sunday, e.g. Feb 2026, leaves two). Week 0 always holds
  // the 1st, so the first four rows always contain in-month days.
  while (weeks.length > 4 && weeks[weeks.length - 1].every((c) => !c.inMonth)) {
    weeks.pop();
  }
  return weeks;
}

/** The previous / next month as {year, month}, 1-based, wrapping the year. */
export function stepMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Parse a `YYYY-MM` param into {year, month}; null when malformed. */
export function parseYearMonth(ym: string | undefined): {
  year: number;
  month: number;
} | null {
  if (!ym) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}
