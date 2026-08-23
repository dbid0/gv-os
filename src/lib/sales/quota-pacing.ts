/**
 * Quota pacing — pure, deterministic, and 100% covered.
 *
 * A quota is a target for a period. Pacing answers the only question that
 * matters mid-period: given how much of the month has elapsed, is the actual
 * running ahead of, on, or behind the straight-line target it should have hit
 * by now? RepVision shows exactly this on every rep and team quota.
 *
 * Everything here is a plain function of its inputs — no clock, no database, no
 * money branding — so the math that colours a rep red or green can be pinned
 * down with tests to the last branch, the same bar the money modules hold.
 * `targetAmount` and `actualSoFar` are integer CENTS for a money metric and a
 * whole count for everything else; the arithmetic is identical either way.
 */

// ---------------------------------------------------------------- Metrics

export type QuotaUnit = "money" | "count";

/** Where the actual-so-far for a metric is read from — all data already in the DB. */
export type QuotaMetricSource = "ledger" | "deals" | "activity";

export interface QuotaMetricDef {
  key: string;
  label: string;
  unit: QuotaUnit;
  source: QuotaMetricSource;
  /** For activity-sourced metrics: the EOD metrics-bundle key that is summed. */
  activityKey?: string;
}

/**
 * The quota metric vocabulary. Deliberately the same names the rest of Sales
 * already speaks: cash from the ledger, deals from closed deals, and the base
 * EOD activity counts (dials · sets · shows · calls) from submitted reports.
 */
export const QUOTA_METRICS: readonly QuotaMetricDef[] = [
  { key: "cash_collected", label: "Cash collected", unit: "money", source: "ledger" },
  { key: "deals", label: "Deals closed", unit: "count", source: "deals" },
  {
    key: "dials",
    label: "Dials",
    unit: "count",
    source: "activity",
    activityKey: "dials",
  },
  {
    key: "sets_booked",
    label: "Sets booked",
    unit: "count",
    source: "activity",
    activityKey: "sets_booked",
  },
  {
    key: "shows",
    label: "Shows",
    unit: "count",
    source: "activity",
    activityKey: "shows",
  },
  {
    key: "calls_taken",
    label: "Calls taken",
    unit: "count",
    source: "activity",
    activityKey: "calls_taken",
  },
] as const;

export const QUOTA_METRIC_KEYS: string[] = QUOTA_METRICS.map((m) => m.key);

export function quotaMetric(key: string): QuotaMetricDef | undefined {
  return QUOTA_METRICS.find((m) => m.key === key);
}

export function quotaMetricLabel(key: string): string {
  return quotaMetric(key)?.label ?? key;
}

export function isMoneyMetric(key: string): boolean {
  return quotaMetric(key)?.unit === "money";
}

// ---------------------------------------------------------------- Period

/**
 * The UTC millisecond bounds of a "YYYY-MM" month, as a half-open interval:
 * `startMs` is the first instant of the month, `endMs` the first instant of the
 * next. Elapsed fraction and "is this period past" both fall out of these.
 */
export function monthBounds(period: string): { startMs: number; endMs: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Invalid quota period "${period}". Expected YYYY-MM.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid quota month "${period}". Month must be 01–12.`);
  }
  return {
    startMs: Date.UTC(year, month - 1, 1),
    endMs: Date.UTC(year, month, 1),
  };
}

// ---------------------------------------------------------------- Pacing

export type PaceStatus = "ahead" | "on_track" | "behind";

/**
 * The on-track band, as a ratio of actual to the straight-line target for the
 * elapsed portion of the period. Inside ±10% is "on track"; outside is ahead or
 * behind. Exported so the thresholds are visible and testable, not buried.
 */
export const BEHIND_BELOW = 0.9;
export const AHEAD_ABOVE = 1.1;

export interface PacingInput {
  /** Cents for a money metric, a whole count otherwise. */
  targetAmount: number;
  actualSoFar: number;
  startMs: number;
  endMs: number;
  nowMs: number;
}

export interface Pacing {
  status: PaceStatus;
  /** 0–1: how much of the period has elapsed. */
  elapsedFraction: number;
  /** The straight-line target for the elapsed portion of the period. */
  proratedTarget: number;
  /** actual ÷ proratedTarget. Null before any target has accrued. */
  pacePct: number | null;
  /** actual ÷ full-period target. 0 when the target is not positive. */
  attainmentPct: number;
  /** Straight-line projection of the full-period total. Null at 0 elapsed. */
  projectedTotal: number | null;
  /** How much of the full-period target is still outstanding, floored at 0. */
  remaining: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** The fraction of the period that has elapsed by `nowMs`, clamped to 0–1. */
export function elapsedFraction(startMs: number, endMs: number, nowMs: number): number {
  // A zero-length or inverted period is treated as fully elapsed rather than
  // dividing by zero.
  if (endMs <= startMs) return 1;
  return clamp01((nowMs - startMs) / (endMs - startMs));
}

/** Ahead / on track / behind from the pace ratio, honest about the no-data case. */
export function paceStatus(pacePct: number | null, actualSoFar: number): PaceStatus {
  // Nothing has accrued to pace against yet: any progress is ahead, none is
  // simply on track — never behind on a target that is still zero.
  if (pacePct === null) return actualSoFar > 0 ? "ahead" : "on_track";
  if (pacePct < BEHIND_BELOW) return "behind";
  if (pacePct > AHEAD_ABOVE) return "ahead";
  return "on_track";
}

/** The full pacing picture for one quota, from its target, actual, and period. */
export function computePacing(input: PacingInput): Pacing {
  const { targetAmount, actualSoFar, startMs, endMs, nowMs } = input;

  const elapsed = elapsedFraction(startMs, endMs, nowMs);
  const proratedTarget = Math.round(targetAmount * elapsed);
  const pacePct = proratedTarget > 0 ? actualSoFar / proratedTarget : null;
  const attainmentPct = targetAmount > 0 ? actualSoFar / targetAmount : 0;
  const projectedTotal = elapsed > 0 ? Math.round(actualSoFar / elapsed) : null;
  const remaining = Math.max(targetAmount - actualSoFar, 0);

  return {
    status: paceStatus(pacePct, actualSoFar),
    elapsedFraction: elapsed,
    proratedTarget,
    pacePct,
    attainmentPct,
    projectedTotal,
    remaining,
  };
}
