/**
 * Chart data helpers — pure. Bucketing happens here so the components stay
 * dumb SVG and the arithmetic stays testable.
 *
 * The chart categorical palette is validator-approved (dataviz six checks,
 * light AND dark surfaces) in a fixed client order.
 * The roster accents FAILED CVD separation (two blues, ΔE 2.3 protan) and are
 * for row tags only — never for series color.
 */

import { BUSINESS_TIME_ZONE, dayKeyIn } from "@/lib/time/zone";

export const CHART_CATEGORICAL = ["#2f8ce8", "#bd7f16", "#bd68b8"] as const;

export interface DayBucket {
  /** yyyy-mm-dd in America/Chicago — business days, not UTC days. */
  date: string;
  label: string;
  value: number;
}

/**
 * A Date's BUSINESS-day key (Central) — for dates that get stored or
 * reconciled (ledger entries, payout months, alerts). Counters a person reads
 * use their own zone instead: `dayKeyIn(d, viewerTimeZone)`.
 */
export function dayKeyCT(d: Date): string {
  return dayKeyIn(d, BUSINESS_TIME_ZONE);
}

/**
 * Bucket dated cent-amounts into calendar months, oldest first. Months with
 * no rows are NOT zero-filled — a month before the business existed is not a
 * zero, it's absence. Input dates are `yyyy-mm-dd` strings (the mirror's
 * dateClosed), so no timezone arithmetic can shift a deal across months.
 */
export function bucketByMonth(rows: { date: string; cents: number }[]): DayBucket[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    sums.set(key, (sums.get(key) ?? 0) + row.cents);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({
      date: month,
      label: new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      value: cents,
    }));
}

/**
 * Bucket timestamps into the last `days` business days, zero-filled, oldest
 * first. `now` is a parameter so tests never depend on the wall clock.
 */
export function bucketByDay(
  timestamps: (Date | null)[],
  days: number,
  now: Date,
  /** The calendar the days are counted on — the viewer's zone. */
  timeZone: string = BUSINESS_TIME_ZONE,
): DayBucket[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    if (!t) continue;
    const key = dayKeyIn(t, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyIn(d, timeZone);
    buckets.push({
      date: key,
      label: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone,
      }),
      value: counts.get(key) ?? 0,
    });
  }
  return buckets;
}

const MONTH_LABELS = [
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
] as const;

/** "yyyy-mm-dd" → "Aug 22", pure string math — no Date, no timezone risk. */
function labelForDayKey(key: string): string {
  const [, m, d] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1] ?? "?"} ${Number(d)}`;
}

/**
 * A level metric sampled over time (subscriber count, balance): keep the
 * LAST sample per CT day, oldest-first. Days without samples are absent,
 * not zero — a missing snapshot is not an empty list.
 */
export function latestPerDay(
  samples: { at: Date; value: number }[],
  timeZone: string = BUSINESS_TIME_ZONE,
): DayBucket[] {
  const latest = new Map<string, { time: number; value: number }>();
  for (const s of samples) {
    const key = dayKeyIn(s.at, timeZone);
    const cur = latest.get(key);
    if (!cur || s.at.getTime() >= cur.time) {
      latest.set(key, { time: s.at.getTime(), value: s.value });
    }
  }
  return [...latest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, label: labelForDayKey(date), value: v.value }));
}

/**
 * Color follows the entity, never its position in a list: fixed client → hue
 * from the validated trio. Unknown names take the first hue (agency default).
 */
export function chartColorForClient(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("vault")) return CHART_CATEGORICAL[1];
  if (n.includes("racks")) return CHART_CATEGORICAL[2];
  return CHART_CATEGORICAL[0];
}
