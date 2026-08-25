import { shiftDay } from "@/lib/activity-heatmap";

/**
 * Rep Performance Trends (RepVision): each rep's current window vs the one
 * before it, for cash / deals / dials / shows, so a manager sees who is heating
 * up and who is sliding. Pure and tested — rolling 7-day (week) and 30-day
 * (month) windows, so a mid-week glance is never skewed by a partial calendar
 * period. The DB gather lives in rep-trends-query.ts.
 */

export interface TrendMetric {
  current: number;
  prior: number;
}

export interface RepTrendRow {
  repId: string;
  name: string;
  teamName: string | null;
  cashCents: TrendMetric;
  deals: TrendMetric;
  dials: TrendMetric;
  shows: TrendMetric;
}

export interface RepTrends {
  week: RepTrendRow[];
  month: RepTrendRow[];
}

export interface TrendDelta {
  direction: "up" | "down" | "flat";
  /** Percent change vs the prior window; null when there was nothing prior. */
  pct: number | null;
}

/** The change from prior → current: direction + a percent when it can be computed. */
export function trendDelta(m: TrendMetric): TrendDelta {
  const { current, prior } = m;
  const direction = current > prior ? "up" : current < prior ? "down" : "flat";
  const pct = prior === 0 ? null : Math.round(((current - prior) / prior) * 100);
  return { direction, pct };
}

/** A day is in [start, end] inclusive — all yyyy-mm-dd, compared lexically. */
function inWindow(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

export interface RepInfo {
  repId: string;
  name: string;
  teamName: string | null;
}
export interface DayActivity {
  repId: string;
  day: string;
  dials: number;
  shows: number;
}
export interface DayDeal {
  repId: string;
  day: string;
  cashCents: number;
}

interface WindowPair {
  curStart: string;
  curEnd: string;
  priorStart: string;
  priorEnd: string;
}

function windows(todayKey: string, span: number): WindowPair {
  return {
    curStart: shiftDay(todayKey, -(span - 1)),
    curEnd: todayKey,
    priorStart: shiftDay(todayKey, -(2 * span - 1)),
    priorEnd: shiftDay(todayKey, -span),
  };
}

function buildRows(
  repList: RepInfo[],
  activity: DayActivity[],
  deals: DayDeal[],
  w: WindowPair,
): RepTrendRow[] {
  const empty = (): TrendMetric => ({ current: 0, prior: 0 });
  const rows = new Map<string, RepTrendRow>();
  for (const r of repList) {
    rows.set(r.repId, {
      repId: r.repId,
      name: r.name,
      teamName: r.teamName,
      cashCents: empty(),
      deals: empty(),
      dials: empty(),
      shows: empty(),
    });
  }

  const bucket = (day: string): "current" | "prior" | null =>
    inWindow(day, w.curStart, w.curEnd)
      ? "current"
      : inWindow(day, w.priorStart, w.priorEnd)
        ? "prior"
        : null;

  for (const a of activity) {
    const row = rows.get(a.repId);
    if (!row) continue;
    const b = bucket(a.day);
    if (!b) continue;
    row.dials[b] += a.dials;
    row.shows[b] += a.shows;
  }
  for (const d of deals) {
    const row = rows.get(d.repId);
    if (!row) continue;
    const b = bucket(d.day);
    if (!b) continue;
    row.deals[b] += 1;
    row.cashCents[b] += d.cashCents;
  }

  // Only reps with any activity in either window, current cash first.
  return [...rows.values()]
    .filter(
      (r) =>
        r.cashCents.current ||
        r.cashCents.prior ||
        r.deals.current ||
        r.deals.prior ||
        r.dials.current ||
        r.dials.prior,
    )
    .sort((a, b) => b.cashCents.current - a.cashCents.current);
}

/** Bucket raw day-keyed rows into week and month trend tables. Pure. */
export function computeRepTrends(
  repList: RepInfo[],
  activity: DayActivity[],
  deals: DayDeal[],
  todayKey: string,
): RepTrends {
  return {
    week: buildRows(repList, activity, deals, windows(todayKey, 7)),
    month: buildRows(repList, activity, deals, windows(todayKey, 30)),
  };
}
