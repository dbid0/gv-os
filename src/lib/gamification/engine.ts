/**
 * Gamification math — pure, deterministic, and 100% covered.
 *
 * RepVision drives rep behaviour with three signals: a consecutive-day streak,
 * per-rep personal-best records, and an activity heatmap ("Best: Wednesday").
 * This module is the math behind all three. It is a plain function of its
 * inputs — no clock, no database, no branding — so every badge and cell can be
 * pinned down with tests to the last branch, the same bar the money and quota
 * modules hold.
 *
 * Nothing here invents a number. A rep with no logged activity yields a zero
 * streak, no personal bests, and an empty heatmap — an honest empty state, not
 * a fabricated one. The read layer (src/lib/gamification/queries.ts) turns real
 * rows into these inputs; this file only counts what it is given.
 *
 * Day keys are `yyyy-mm-dd` calendar days (produced by dayKeyCT so a late-night
 * call lands on the right business day). Calendar arithmetic runs at UTC noon,
 * which moves between dates without ever tripping over a timezone or DST edge.
 */

// ---------------------------------------------------------------- Day-key math

const DAY_MS = 86_400_000;

/** Parse a `yyyy-mm-dd` day key at UTC noon — safe for calendar arithmetic. */
function dayKeyToUtcNoon(key: string): number {
  return Date.parse(`${key}T12:00:00Z`);
}

/** Shift a `yyyy-mm-dd` day key by whole days, returning a new day key. */
export function shiftDayKey(key: string, deltaDays: number): string {
  return new Date(dayKeyToUtcNoon(key) + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

/** Weekday for a `yyyy-mm-dd` day key: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return new Date(dayKeyToUtcNoon(key)).getUTCDay();
}

/** "yyyy-mm-dd" → "Aug 22" for compact labels. */
export function formatDayKey(key: string): string {
  return new Date(dayKeyToUtcNoon(key)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// ---------------------------------------------------------------- Streaks

export interface StreakResult {
  /** Consecutive active days ending today or yesterday. 0 if the streak broke. */
  current: number;
  /** The longest consecutive-day run the rep has ever put together. */
  longest: number;
  /** The most recent day the rep logged any activity, or null. */
  lastActiveDay: string | null;
}

/**
 * A rep's activity streak from the set of days they were active on.
 *
 * "Current" only counts if the most recent active day is today or yesterday —
 * a gap of two or more days means the streak is broken, exactly like RepVision.
 * Keeping yesterday alive is the grace period: the day is not over yet.
 */
export function computeStreak(
  activeDayKeys: Iterable<string>,
  todayKey: string,
): StreakResult {
  const days = [...new Set(activeDayKeys)].sort();
  if (days.length === 0) {
    return { current: 0, longest: 0, lastActiveDay: null };
  }

  // Longest run of consecutive calendar days anywhere in the history.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === shiftDayKey(days[i - 1], 1)) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // The current run ends at the most recent active day, and only counts when
  // that day is today or yesterday.
  const lastActiveDay = days[days.length - 1];
  const yesterdayKey = shiftDayKey(todayKey, -1);
  let current = 0;
  if (lastActiveDay === todayKey || lastActiveDay === yesterdayKey) {
    const set = new Set(days);
    let cursor = lastActiveDay;
    while (set.has(cursor)) {
      current += 1;
      cursor = shiftDayKey(cursor, -1);
    }
  }

  return { current, longest, lastActiveDay };
}

// ---------------------------------------------------------------- Personal bests

export type PbFormat = "number" | "currency";

export interface PbMetricDef {
  key: string;
  label: string;
  format: PbFormat;
}

/** One day's worth of a rep's metrics, keyed by the shared metric vocabulary. */
export interface DayMetrics {
  dayKey: string;
  metrics: Record<string, number>;
}

export interface PersonalBest {
  key: string;
  label: string;
  format: PbFormat;
  /** Cents for a currency metric, a plain count otherwise. */
  value: number;
  /** The day the record was set. */
  dayKey: string;
}

/**
 * The default record book — the single-day highs worth chasing. Cash is in
 * cents; the rest are counts drawn from the same field vocabulary the EOD
 * templates and leaderboard already speak.
 */
export const PB_METRICS: readonly PbMetricDef[] = [
  { key: "cash", label: "Best cash day", format: "currency" },
  { key: "deals_closed", label: "Best close day", format: "number" },
  { key: "dials", label: "Most dials", format: "number" },
  { key: "sets_booked", label: "Most sets", format: "number" },
  { key: "shows", label: "Most shows", format: "number" },
  { key: "connects", label: "Most connects", format: "number" },
  { key: "dms_sent", label: "Most DMs", format: "number" },
];

/**
 * Each metric's best single day. A metric that never had a positive day yields
 * no record — an honest absence, never a "best: 0". On a tie the earliest day
 * keeps the record, since it happened first.
 */
export function computePersonalBests(
  days: DayMetrics[],
  metrics: readonly PbMetricDef[] = PB_METRICS,
): PersonalBest[] {
  const bests: PersonalBest[] = [];
  for (const def of metrics) {
    let best: PersonalBest | null = null;
    for (const day of days) {
      const value = day.metrics[def.key] ?? 0;
      if (value <= 0) continue;
      if (best === null || value > best.value) {
        best = {
          key: def.key,
          label: def.label,
          format: def.format,
          value,
          dayKey: day.dayKey,
        };
      }
    }
    if (best !== null) bests.push(best);
  }
  return bests;
}

// ---------------------------------------------------------------- Heatmap

/** A single day's activity scalar. */
export interface DayCount {
  dayKey: string;
  value: number;
}

export interface HeatmapCell {
  dayKey: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  value: number;
  /** 0 (empty) … 4 (busiest), for colour intensity. */
  level: number;
}

export interface Heatmap {
  /** One row per week, oldest first; each row is 7 cells, Sunday → Saturday. */
  weeks: HeatmapCell[][];
  /** Total activity per weekday across the window, indexed 0 = Sunday. */
  weekdayTotals: number[];
  /** The busiest weekday index, or null when there is no activity at all. */
  bestWeekday: number | null;
  /** "Wednesday" etc., or null when there is no activity. */
  bestWeekdayLabel: string | null;
  /** The busiest single day's value, used to scale the intensity levels. */
  max: number;
  /** Total activity across the whole window. */
  total: number;
}

/** Bucket a day's value into a 0–4 intensity level relative to the busiest day. */
function levelFor(value: number, max: number): number {
  if (value <= 0) return 0;
  return Math.min(4, Math.ceil((value / max) * 4));
}

/**
 * A day-of-week × recent-weeks grid, anchored so the last row is the current
 * week (Sunday → Saturday) and rows go back `weeks` weeks. Empty days are zero,
 * not absent, because a blank cell in a calendar grid is meaningful. The best
 * weekday is the one with the most total activity across the window.
 */
export function computeHeatmap(
  dailyActivity: DayCount[],
  weeks: number,
  todayKey: string,
): Heatmap {
  const byDay = new Map<string, number>();
  for (const d of dailyActivity) {
    byDay.set(d.dayKey, (byDay.get(d.dayKey) ?? 0) + d.value);
  }

  // Anchor to the Sunday of today's week, then step back to the first row.
  const thisSunday = shiftDayKey(todayKey, -weekdayOf(todayKey));
  const firstSunday = shiftDayKey(thisSunday, -(weeks - 1) * 7);

  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  let max = 0;
  let total = 0;
  const raw: { dayKey: string; weekday: number; value: number }[][] = [];

  for (let w = 0; w < weeks; w += 1) {
    const row: { dayKey: string; weekday: number; value: number }[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const dayKey = shiftDayKey(firstSunday, w * 7 + dow);
      const value = byDay.get(dayKey) ?? 0;
      row.push({ dayKey, weekday: dow, value });
      weekdayTotals[dow] += value;
      total += value;
      if (value > max) max = value;
    }
    raw.push(row);
  }

  const gridWeeks: HeatmapCell[][] = raw.map((row) =>
    row.map((c) => ({ ...c, level: levelFor(c.value, max) })),
  );

  let bestWeekday: number | null = null;
  let bestTotal = 0;
  for (let dow = 0; dow < 7; dow += 1) {
    if (weekdayTotals[dow] > bestTotal) {
      bestTotal = weekdayTotals[dow];
      bestWeekday = dow;
    }
  }

  return {
    weeks: gridWeeks,
    weekdayTotals,
    bestWeekday,
    bestWeekdayLabel: bestWeekday === null ? null : WEEKDAY_FULL[bestWeekday],
    max,
    total,
  };
}

// ---------------------------------------------------------------- Combined

export const DEFAULT_HEATMAP_WEEKS = 12;

export interface RepGamificationInput {
  /** Today's day key (from dayKeyCT), so the math never reads the wall clock. */
  todayKey: string;
  /** Every day the rep did anything — the streak's raw material. */
  activeDayKeys: string[];
  /** Per-day metric bundles, for the personal-best record book. */
  dayMetrics: DayMetrics[];
  /** Per-day activity scalar, for the heatmap. */
  dailyActivity: DayCount[];
  heatmapWeeks?: number;
  pbMetrics?: readonly PbMetricDef[];
}

export interface RepGamification {
  streak: StreakResult;
  personalBests: PersonalBest[];
  heatmap: Heatmap;
  /** False when the rep has never logged anything — drives the empty state. */
  hasActivity: boolean;
}

/** The whole gamification bundle for one rep, from real per-day inputs. */
export function computeRepGamification(input: RepGamificationInput): RepGamification {
  const weeks = input.heatmapWeeks ?? DEFAULT_HEATMAP_WEEKS;
  return {
    streak: computeStreak(input.activeDayKeys, input.todayKey),
    personalBests: computePersonalBests(input.dayMetrics, input.pbMetrics),
    heatmap: computeHeatmap(input.dailyActivity, weeks, input.todayKey),
    hasActivity: input.activeDayKeys.length > 0,
  };
}
