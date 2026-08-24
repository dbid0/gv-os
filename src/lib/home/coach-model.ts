/**
 * Coach home model — pure, deterministic, and 100% covered.
 *
 * The manager's home ("Coach") is a read of their own offers' sales world: cash
 * and deals this month, how the team is pacing against quota, who has not filed
 * an EOD, the close/show-rate trend, and the top and bottom rep. Every figure is
 * DERIVED from rows the app already stores — quotas, submitted EODs, the
 * leaderboard, and the scoped month totals — so nothing here is invented.
 *
 * This file only does the arithmetic. It takes already-scoped, already-fetched
 * plain data (the server layer does the DB reads and the scoping) and folds it
 * into the view model, so the shaping that colours a team red or green can be
 * pinned down with tests to the last branch. No clock, no database, no money
 * branding — cents are plain integers here, formatted for display upstream.
 */

import { shiftDayKey } from "@/lib/gamification/engine";

// ---------------------------------------------------------------- Inputs

/** One rep's ranked line, the fields the Coach board needs. */
export interface CoachRepStat {
  repId: string;
  name: string;
  teamName: string | null;
  cashCents: number;
  dealsClosed: number;
  shows: number;
}

/** A scoped quota with its pacing already computed. */
export interface CoachQuota {
  scope: "rep" | "team";
  repName: string | null;
  teamName: string | null;
  metricLabel: string;
  status: "ahead" | "on_track" | "behind";
  attainmentPct: number;
  isPast: boolean;
}

/** One rep-day of submitted EOD activity, its CT day key already resolved. */
export interface CoachEodDay {
  repId: string;
  dayKey: string;
  shows: number;
  noShows: number;
}

/** An active rep in scope, for EOD-compliance denominators. */
export interface CoachActiveRep {
  id: string;
  name: string;
  teamName: string | null;
}

export interface CoachInput {
  /** True when the viewer sees every offer (admin / agency-wide manager). */
  isAllOffers: boolean;
  /** "All offers" or the single offer's name. */
  scopeLabel: string;
  /** This month, scoped: collected cash, deals closed, and contract revenue. */
  monthCashCents: number;
  monthDealsClosed: number;
  monthRevenueCents: number;
  /** Deals closed last month in scope, for the close-rate trend. */
  prevMonthDealsClosed: number;
  quotas: CoachQuota[];
  /** Reps in scope, in leaderboard order (best first). */
  reps: CoachRepStat[];
  eodDays: CoachEodDay[];
  activeReps: CoachActiveRep[];
  /** Today's CT day key. */
  todayKey: string;
  /** Current and previous months, as YYYY-MM. */
  period: string;
  prevPeriod: string;
  /** Days in the "this week" compliance window. Defaults to 7. */
  weekWindowDays?: number;
}

// ---------------------------------------------------------------- Outputs

export interface CoachRepLine {
  name: string;
  teamName: string | null;
  cashCents: number;
  dealsClosed: number;
}

export interface CoachRepBehind {
  name: string;
  teamName: string | null;
  metricLabel: string;
  attainmentPct: number;
}

export interface CoachEodCompliance {
  submitted: number;
  total: number;
  /** Names still missing, worst-case ordered (alphabetical), for a clean list. */
  missing: string[];
}

export type RateDelta = "up" | "down" | "flat";

export interface CoachRate {
  /** 0–1, or null when nothing has resolved yet. */
  rate: number | null;
  /** Movement vs last month, or null when either month has no rate. */
  delta: RateDelta | null;
}

export interface CoachModel {
  offers: {
    cashCents: number;
    dealsClosed: number;
    revenueCents: number;
    isAllOffers: boolean;
    scopeLabel: string;
  };
  quota: {
    total: number;
    ahead: number;
    onTrack: number;
    behind: number;
    repsBehind: CoachRepBehind[];
  };
  eodToday: CoachEodCompliance;
  eodWeek: CoachEodCompliance;
  closeRate: CoachRate;
  showRate: CoachRate;
  topRep: CoachRepLine | null;
  bottomRep: CoachRepLine | null;
  hasReps: boolean;
  hasData: boolean;
}

// ---------------------------------------------------------------- Quotas

function summarizeQuota(quotas: CoachQuota[]): CoachModel["quota"] {
  const active = quotas.filter((q) => !q.isPast);
  const repsBehind: CoachRepBehind[] = active
    .filter((q) => q.scope === "rep" && q.status === "behind")
    .map((q) => ({
      name: q.repName ?? "Unassigned rep",
      teamName: q.teamName,
      metricLabel: q.metricLabel,
      attainmentPct: q.attainmentPct,
    }))
    // Worst pacing first — the reps a manager should call today.
    .sort((a, b) => a.attainmentPct - b.attainmentPct);

  return {
    total: active.length,
    ahead: active.filter((q) => q.status === "ahead").length,
    onTrack: active.filter((q) => q.status === "on_track").length,
    behind: active.filter((q) => q.status === "behind").length,
    repsBehind,
  };
}

// ---------------------------------------------------------------- EOD compliance

/** The set of rep ids that filed at least one EOD on any of `dayKeys`. */
function repsSubmittedOn(eodDays: CoachEodDay[], dayKeys: Set<string>): Set<string> {
  const submitted = new Set<string>();
  for (const d of eodDays) {
    if (dayKeys.has(d.dayKey)) submitted.add(d.repId);
  }
  return submitted;
}

function compliance(
  activeReps: CoachActiveRep[],
  submitted: Set<string>,
): CoachEodCompliance {
  const missing = activeReps
    .filter((r) => !submitted.has(r.id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));
  return {
    total: activeReps.length,
    submitted: activeReps.length - missing.length,
    missing,
  };
}

/** The window of CT day keys covering "this week" — today and the prior N-1 days. */
function weekWindow(todayKey: string, days: number): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < days; i += 1) keys.add(shiftDayKey(todayKey, -i));
  return keys;
}

// ---------------------------------------------------------------- Rates

interface MonthActivity {
  shows: number;
  noShows: number;
}

function activityForMonth(eodDays: CoachEodDay[], period: string): MonthActivity {
  let shows = 0;
  let noShows = 0;
  for (const d of eodDays) {
    if (d.dayKey.slice(0, 7) !== period) continue;
    shows += d.shows;
    noShows += d.noShows;
  }
  return { shows, noShows };
}

/** shows ÷ (shows + no-shows), or null until a call resolves either way. */
function showRateOf(a: MonthActivity): number | null {
  const resolved = a.shows + a.noShows;
  return resolved > 0 ? a.shows / resolved : null;
}

/** deals ÷ shows, or null until at least one prospect shows. */
function closeRateOf(deals: number, a: MonthActivity): number | null {
  return a.shows > 0 ? deals / a.shows : null;
}

function deltaOf(cur: number | null, prev: number | null): RateDelta | null {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  // A sub-half-point move reads as flat, so noise never shows a false arrow.
  if (Math.abs(diff) < 0.005) return "flat";
  return diff > 0 ? "up" : "down";
}

// ---------------------------------------------------------------- Build

/** Fold the scoped, fetched rows into the Coach view model. */
export function buildCoachModel(input: CoachInput): CoachModel {
  const {
    isAllOffers,
    scopeLabel,
    monthCashCents,
    monthDealsClosed,
    monthRevenueCents,
    prevMonthDealsClosed,
    quotas,
    reps,
    eodDays,
    activeReps,
    todayKey,
    period,
    prevPeriod,
  } = input;

  const weekDays = input.weekWindowDays ?? 7;

  const eodToday = compliance(
    activeReps,
    repsSubmittedOn(eodDays, new Set([todayKey])),
  );
  const eodWeek = compliance(
    activeReps,
    repsSubmittedOn(eodDays, weekWindow(todayKey, weekDays)),
  );

  const curActivity = activityForMonth(eodDays, period);
  const prevActivity = activityForMonth(eodDays, prevPeriod);

  const curClose = closeRateOf(monthDealsClosed, curActivity);
  const prevClose = closeRateOf(prevMonthDealsClosed, prevActivity);
  const curShow = showRateOf(curActivity);
  const prevShow = showRateOf(prevActivity);

  const topRep = reps.length > 0 ? toRepLine(reps[0]) : null;
  // A single rep is only a "top" — there is no meaningful bottom to compare to.
  const bottomRep = reps.length > 1 ? toRepLine(reps[reps.length - 1]) : null;

  const hasReps = activeReps.length > 0 || reps.length > 0;
  const hasData =
    monthCashCents > 0 ||
    monthDealsClosed > 0 ||
    quotas.length > 0 ||
    eodDays.length > 0 ||
    reps.some((r) => r.cashCents > 0 || r.dealsClosed > 0 || r.shows > 0);

  return {
    offers: {
      cashCents: monthCashCents,
      dealsClosed: monthDealsClosed,
      revenueCents: monthRevenueCents,
      isAllOffers,
      scopeLabel,
    },
    quota: summarizeQuota(quotas),
    eodToday,
    eodWeek,
    closeRate: { rate: curClose, delta: deltaOf(curClose, prevClose) },
    showRate: { rate: curShow, delta: deltaOf(curShow, prevShow) },
    topRep,
    bottomRep,
    hasReps,
    hasData,
  };
}

function toRepLine(r: CoachRepStat): CoachRepLine {
  return {
    name: r.name,
    teamName: r.teamName,
    cashCents: r.cashCents,
    dealsClosed: r.dealsClosed,
  };
}
