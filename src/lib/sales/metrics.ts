import "server-only";

import { formatUSD, cents } from "@/lib/money";
import {
  getLeaderboard,
  getSalesOverview,
  type LeaderboardRow,
  type SalesOverviewStats,
} from "@/lib/sales/queries";

/**
 * The RepVision-style dense KPI wall — one flat list of the numbers a sales
 * dashboard leads with, computed from real activity (summed EOD reports) and
 * the money ledger. Pure formatting so it is testable to the character; the
 * DB gather is the thin wrapper below.
 *
 * Rates divide safely: a zero denominator yields an em dash, never NaN or a
 * fake 0% — "no shows yet" is not the same claim as "0% close rate".
 */

export type MetricKind = "money" | "count" | "rate";

export interface SalesMetric {
  key: string;
  label: string;
  value: string;
  kind: MetricKind;
}

export interface SalesMetricsInput {
  cashCents: number;
  revenueCents: number;
  deals: number;
  dials: number;
  connects: number;
  setsBooked: number;
  callsTaken: number;
  shows: number;
  followUps: number;
  activeReps: number;
  activeTeams: number;
}

const DASH = "—";

/** n/d as a percent, or an em dash when there is no denominator. */
function rate(numerator: number, denominator: number): string {
  if (denominator <= 0) return DASH;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** total/count in whole dollars, or an em dash when count is zero. */
function perUnit(totalCents: number, count: number): string {
  if (count <= 0) return DASH;
  return formatUSD(cents(Math.round(totalCents / count)));
}

const count = (n: number) => n.toLocaleString("en-US");

/**
 * Build the metric wall. Order mirrors RepVision: money first, then volume,
 * then the derived rates — the reading order a sales lead scans.
 */
export function computeSalesMetrics(i: SalesMetricsInput): SalesMetric[] {
  const money = (key: string, label: string, value: string): SalesMetric => ({
    key,
    label,
    value,
    kind: "money",
  });
  const vol = (key: string, label: string, n: number): SalesMetric => ({
    key,
    label,
    value: count(n),
    kind: "count",
  });
  const pct = (key: string, label: string, value: string): SalesMetric => ({
    key,
    label,
    value,
    kind: "rate",
  });

  return [
    money("cash", "Cash collected", formatUSD(cents(i.cashCents))),
    money("revenue", "Revenue", formatUSD(cents(i.revenueCents))),
    money("cash-per-deal", "Cash / deal", perUnit(i.cashCents, i.deals)),
    money("avg-deal", "Avg deal size", perUnit(i.revenueCents, i.deals)),
    vol("deals", "Deals closed", i.deals),
    vol("shows", "Shows", i.shows),
    vol("sets", "Sets booked", i.setsBooked),
    vol("dials", "Dials", i.dials),
    vol("connects", "Connects", i.connects),
    vol("calls-taken", "Calls taken", i.callsTaken),
    vol("follow-ups", "Follow-ups", i.followUps),
    vol("reps", "Active reps", i.activeReps),
    vol("teams", "Active teams", i.activeTeams),
    pct("close-rate", "Close rate", rate(i.deals, i.shows)),
    pct("set-to-close", "Set-to-close", rate(i.deals, i.setsBooked)),
    pct("show-rate", "Show rate", rate(i.shows, i.setsBooked)),
    pct("connect-rate", "Connect rate", rate(i.connects, i.dials)),
  ];
}

/**
 * Build the wall from already-fetched overview + leaderboard. Pure — so a page
 * that already has both (the dashboard) can derive metrics without re-querying.
 */
export function salesMetricsFrom(
  overview: SalesOverviewStats,
  leaderboard: LeaderboardRow[],
): SalesMetric[] {
  const totals = leaderboard.reduce(
    (acc, r) => ({
      dials: acc.dials + r.dials,
      connects: acc.connects + r.connects,
      setsBooked: acc.setsBooked + r.setsBooked,
      callsTaken: acc.callsTaken + r.callsTaken,
      shows: acc.shows + r.shows,
      followUps: acc.followUps + r.followUps,
    }),
    {
      dials: 0,
      connects: 0,
      setsBooked: 0,
      callsTaken: 0,
      shows: 0,
      followUps: 0,
    },
  );
  return computeSalesMetrics({
    cashCents: overview.cashCollectedCents,
    revenueCents: overview.revenueCents,
    deals: overview.dealsClosed,
    activeReps: leaderboard.length,
    activeTeams: overview.teamCount,
    ...totals,
  });
}

/** Gather real rows and build the wall. */
export async function getSalesMetrics(): Promise<SalesMetric[]> {
  const [overview, leaderboard] = await Promise.all([
    getSalesOverview(),
    getLeaderboard(),
  ]);
  return salesMetricsFrom(overview, leaderboard);
}
