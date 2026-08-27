import "server-only";

import { formatUSD, cents } from "@/lib/money";
import {
  getCommissionRollup,
  getEodCompliance,
  getLeaderboard,
  getSalesOverview,
} from "@/lib/sales/queries";

/**
 * The RepVision-style dense KPI wall — a curated CATALOG of the numbers a sales
 * dashboard leads with, computed from real activity (summed EOD reports), the
 * money ledger, and the tested commission engine. Every figure is pure
 * formatting so it is testable to the character; the DB gather is the thin
 * wrapper below.
 *
 * The wall is a metric BUILDER (Daniel's ask, WAP / RepVision style): the
 * registry below is the full catalog a user can add from, `computeSalesMetrics`
 * formats every one, and the dashboard renders only the ids the user has kept.
 * Nothing here invents a number — a metric is a derived DISPLAY of an
 * already-computed value, never new money math.
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

/**
 * Everything a metric can be derived from, gathered once. New fields are
 * optional so a metric that has no source yet degrades honestly (an em dash or
 * a real zero) instead of forcing every caller to supply it.
 */
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
  /** Total commission owed across the book, from the commission rollup. */
  commissionOwedCents?: number;
  /** EODs filed on the latest submission day. */
  eodSubmitted?: number;
  /** Active reps expected to file that day. */
  eodTotal?: number;
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
const money = (c: number) => formatUSD(cents(c));

/** One entry in the metric catalog: how to derive and display one figure. */
export interface SalesMetricDef {
  id: string;
  label: string;
  kind: MetricKind;
  /** Derive the display string from the gathered input. Pure. */
  derive: (i: SalesMetricsInput) => string;
}

/**
 * Every id in the catalog, as a literal tuple — the allow-list the save action
 * validates against and the source of the `SalesMetricId` type.
 */
export const SALES_METRIC_IDS = [
  // Money — what landed, and per-unit economics.
  "cash",
  "revenue",
  "cash-per-deal",
  "avg-deal",
  "commission-owed",
  "cash-per-rep",
  "revenue-per-rep",
  "cash-per-team",
  // Volume — the counts behind the money.
  "deals",
  "shows",
  "sets",
  "dials",
  "connects",
  "calls-taken",
  "follow-ups",
  "reps",
  "teams",
  // Rates — the derived conversions a sales lead scans.
  "close-rate",
  "set-to-close",
  "show-rate",
  "connect-rate",
  "call-to-close",
  "dial-to-set",
  "connect-to-set",
  "collection-rate",
  "eod-compliance",
] as const;
export type SalesMetricId = (typeof SALES_METRIC_IDS)[number];

/**
 * The full metric catalog. Order mirrors RepVision — money, then volume, then
 * the derived rates: the reading order a sales lead scans. This is the menu the
 * "+" picker offers; the wall shows whichever of these the user keeps.
 */
export const SALES_METRIC_REGISTRY: readonly SalesMetricDef[] = [
  // Money.
  {
    id: "cash",
    label: "Cash collected",
    kind: "money",
    derive: (i) => money(i.cashCents),
  },
  {
    id: "revenue",
    label: "Revenue",
    kind: "money",
    derive: (i) => money(i.revenueCents),
  },
  {
    id: "cash-per-deal",
    label: "Cash / deal",
    kind: "money",
    derive: (i) => perUnit(i.cashCents, i.deals),
  },
  {
    id: "avg-deal",
    label: "Avg deal size",
    kind: "money",
    derive: (i) => perUnit(i.revenueCents, i.deals),
  },
  {
    id: "commission-owed",
    label: "Commission owed",
    kind: "money",
    derive: (i) => money(i.commissionOwedCents ?? 0),
  },
  {
    id: "cash-per-rep",
    label: "Cash / rep",
    kind: "money",
    derive: (i) => perUnit(i.cashCents, i.activeReps),
  },
  {
    id: "revenue-per-rep",
    label: "Revenue / rep",
    kind: "money",
    derive: (i) => perUnit(i.revenueCents, i.activeReps),
  },
  {
    id: "cash-per-team",
    label: "Cash / team",
    kind: "money",
    derive: (i) => perUnit(i.cashCents, i.activeTeams),
  },
  // Volume.
  { id: "deals", label: "Deals closed", kind: "count", derive: (i) => count(i.deals) },
  { id: "shows", label: "Shows", kind: "count", derive: (i) => count(i.shows) },
  {
    id: "sets",
    label: "Sets booked",
    kind: "count",
    derive: (i) => count(i.setsBooked),
  },
  { id: "dials", label: "Dials", kind: "count", derive: (i) => count(i.dials) },
  {
    id: "connects",
    label: "Connects",
    kind: "count",
    derive: (i) => count(i.connects),
  },
  {
    id: "calls-taken",
    label: "Calls taken",
    kind: "count",
    derive: (i) => count(i.callsTaken),
  },
  {
    id: "follow-ups",
    label: "Follow-ups",
    kind: "count",
    derive: (i) => count(i.followUps),
  },
  {
    id: "reps",
    label: "Active reps",
    kind: "count",
    derive: (i) => count(i.activeReps),
  },
  {
    id: "teams",
    label: "Active teams",
    kind: "count",
    derive: (i) => count(i.activeTeams),
  },
  // Rates.
  {
    id: "close-rate",
    label: "Close rate",
    kind: "rate",
    derive: (i) => rate(i.deals, i.shows),
  },
  {
    id: "set-to-close",
    label: "Set-to-close",
    kind: "rate",
    derive: (i) => rate(i.deals, i.setsBooked),
  },
  {
    id: "show-rate",
    label: "Show rate",
    kind: "rate",
    derive: (i) => rate(i.shows, i.setsBooked),
  },
  {
    id: "connect-rate",
    label: "Connect rate",
    kind: "rate",
    derive: (i) => rate(i.connects, i.dials),
  },
  {
    id: "call-to-close",
    label: "Call-to-close",
    kind: "rate",
    derive: (i) => rate(i.deals, i.callsTaken),
  },
  {
    id: "dial-to-set",
    label: "Dial-to-set",
    kind: "rate",
    derive: (i) => rate(i.setsBooked, i.dials),
  },
  {
    id: "connect-to-set",
    label: "Connect-to-set",
    kind: "rate",
    derive: (i) => rate(i.setsBooked, i.connects),
  },
  {
    id: "collection-rate",
    label: "Collection rate",
    kind: "rate",
    derive: (i) => rate(i.cashCents, i.revenueCents),
  },
  {
    id: "eod-compliance",
    label: "EOD compliance",
    kind: "rate",
    derive: (i) => rate(i.eodSubmitted ?? 0, i.eodTotal ?? 0),
  },
];

/**
 * The default wall — the set the dashboard has always shown, in its original
 * order, so an unconfigured user (or a wiped pref) sees exactly what shipped
 * before the builder existed. New catalog metrics live in the "+" picker.
 */
export const DEFAULT_SALES_METRIC_IDS: SalesMetricId[] = [
  "cash",
  "revenue",
  "cash-per-deal",
  "avg-deal",
  "deals",
  "shows",
  "sets",
  "dials",
  "connects",
  "calls-taken",
  "follow-ups",
  "reps",
  "teams",
  "close-rate",
  "set-to-close",
  "show-rate",
  "connect-rate",
];

const VALID_IDS = new Set<string>(SALES_METRIC_IDS);

/**
 * Coerce a stored pref into a clean, ordered, de-duplicated id list. Anything
 * that is not the catalog (a removed metric, a bad write) is dropped; an empty
 * or absent selection falls back to the default wall.
 */
export function normalizeSalesMetricIds(value: unknown): SalesMetricId[] {
  if (!Array.isArray(value)) return DEFAULT_SALES_METRIC_IDS;
  const valid = value.filter((v): v is SalesMetricId => VALID_IDS.has(v as string));
  const deduped = [...new Set(valid)];
  return deduped.length > 0 ? deduped : DEFAULT_SALES_METRIC_IDS;
}

/**
 * Format the whole catalog from one gathered input. The dashboard renders the
 * user's chosen subset; the picker offers the rest. Order mirrors the registry.
 */
export function computeSalesMetrics(i: SalesMetricsInput): SalesMetric[] {
  return SALES_METRIC_REGISTRY.map((def) => ({
    key: def.id,
    label: def.label,
    value: def.derive(i),
    kind: def.kind,
  }));
}

/** Gather real rows and format the full metric catalog. */
export async function getSalesMetrics(): Promise<SalesMetric[]> {
  const [overview, leaderboard, rollup, eod] = await Promise.all([
    getSalesOverview(),
    getLeaderboard(),
    getCommissionRollup(),
    getEodCompliance(),
  ]);
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
    commissionOwedCents: rollup.totalOwedCents,
    eodSubmitted: eod.submitted,
    eodTotal: eod.total,
    ...totals,
  });
}
