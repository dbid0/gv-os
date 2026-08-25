/**
 * Pure model for the activity heatmap — RepVision's "Time Period Trends": a
 * GitHub-contribution-style grid, columns = weeks, rows = day of week, each
 * cell a calendar day shaded by intensity (darker = more). No DOM, no clock
 * (today is passed in), so it is testable to the cell.
 */

const DAY_MS = 86_400_000;

/** Day-of-week for a yyyy-mm-dd key: 0 = Sunday … 6 = Saturday. Noon-UTC = DST-safe. */
export function dayOfWeek(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Shift a yyyy-mm-dd key by whole days. */
export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(
    t.getUTCDate(),
  ).padStart(2, "0")}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface HeatCell {
  day: string;
  value: number;
  /** 0 = empty; 1–4 = increasing intensity. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapModel {
  weeks: number;
  /** columns[week][dayOfWeek 0–6]; null = a day outside the window (e.g. future). */
  columns: (HeatCell | null)[][];
  /** Month labels keyed to the column where a new month begins. */
  monthLabels: { col: number; label: string }[];
  max: number;
  total: number;
}

function levelFor(value: number, max: number): HeatCell["level"] {
  if (value <= 0 || max <= 0) return 0;
  const q = value / max;
  if (q > 0.75) return 4;
  if (q > 0.5) return 3;
  if (q > 0.25) return 2;
  return 1;
}

/**
 * Build the grid for the last `weeks` weeks ending in the week containing
 * `todayKey`. Values are keyed by day; missing days are zero. Days after today
 * (the rest of the current week) are null so the grid never implies future data.
 */
export function buildActivityHeatmap(
  values: { day: string; value: number }[],
  todayKey: string,
  weeks = 13,
): HeatmapModel {
  const byDay = new Map<string, number>();
  for (const v of values) {
    byDay.set(v.day, (byDay.get(v.day) ?? 0) + v.value);
  }

  // The first cell is the Sunday of the earliest visible week.
  const startSunday = shiftDay(todayKey, -dayOfWeek(todayKey) - (weeks - 1) * 7);

  const max = Math.max(0, ...values.map((v) => v.value));
  let total = 0;

  const columns: (HeatCell | null)[][] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = "";

  for (let w = 0; w < weeks; w++) {
    const col: (HeatCell | null)[] = [];
    for (let row = 0; row < 7; row++) {
      const day = shiftDay(startSunday, w * 7 + row);
      if (day > todayKey) {
        col.push(null);
        continue;
      }
      const value = byDay.get(day) ?? 0;
      total += value;
      col.push({ day, value, level: levelFor(value, max) });
    }
    columns.push(col);

    // Label a column when its first in-range day starts a new month.
    const firstDay = col.find((c): c is HeatCell => c !== null)?.day;
    if (firstDay) {
      const month = MONTHS[Number(firstDay.slice(5, 7)) - 1] ?? "";
      if (month && month !== lastMonth) {
        monthLabels.push({ col: w, label: month });
        lastMonth = month;
      }
    }
  }

  return { weeks, columns, monthLabels, max, total };
}
