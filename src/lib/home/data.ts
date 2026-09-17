import "server-only";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityReports, bookings, deals, reps } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { type RepGamification } from "@/lib/gamification/engine";
import { getRepGamification } from "@/lib/gamification/queries";
import { callTypeLabel, dispositionLabel } from "@/lib/sales/call-activity";
import { listCallLogs } from "@/lib/sales/call-queries";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getLeaderboard,
  getPaidRepIds,
  listReps,
  listTeams,
} from "@/lib/sales/queries";
import { listQuotasWithPacing } from "@/lib/sales/quota-queries";
import {
  type CoachActiveRep,
  type CoachEodDay,
  type CoachModel,
  type CoachQuota,
  type CoachRepStat,
  buildCoachModel,
} from "@/lib/home/coach-model";
import {
  type WingmanCommission,
  type WingmanModel,
  type WingmanQuota,
  buildWingmanModel,
} from "@/lib/home/wingman-model";
import { callQueue, type CallQueue } from "@/lib/home/call-queue";
import { dayEndIn, dayKeyIn, dayStartIn } from "@/lib/time/zone";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

/**
 * The role home server layer.
 *
 * The DB reads and the offer/rep scoping live here; the arithmetic lives in the
 * pure, fully covered `coach-model` and `wingman-model`. Nothing here rewrites a
 * read layer — it REUSES the same query functions the Sales, Quotas,
 * gamification, and Commissions surfaces already trust (leaderboard, quota
 * pacing, gamification, the commission rollup), plus a few thin scoped display
 * reads of the SAME operational tables those layers read (deals, the ledger's
 * payment events, submitted EODs, logged calls). It never touches the money
 * modules' math — it only measures against what they recorded.
 *
 * "now" is passed in from a single `new Date()` in the page, so every read is a
 * pure function of the clock the caller chose — no server component reaches for
 * `Date.now()`.
 */

/** A metric out of an EOD bundle, defaulting to 0 for a missing/non-number key. */
function metricNum(metrics: Record<string, number> | null, key: string): number {
  const v = metrics?.[key];
  return typeof v === "number" ? v : 0;
}

/** The calendar month before a YYYY-MM string, in UTC (label math only). */
function prevMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

interface ScopedMonthSales {
  cashCents: number;
  dealsClosed: number;
  revenueCents: number;
}

/**
 * One month's SALES cash and closed deals for a set of offers — collected cash
 * from the ledger's payment events and closed-deal counts from the deals table,
 * both bucketed to the viewer's month. Sales cash, not accounting: the Coach
 * home never shows a payout or a partner split.
 */
async function scopedMonthSales(
  clientIds: string[],
  period: string,
  tz: string,
): Promise<ScopedMonthSales> {
  if (clientIds.length === 0) {
    return { cashCents: 0, dealsClosed: 0, revenueCents: 0 };
  }
  const db = getDb();

  const [cashRow] = await db
    .select({ total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)` })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.eventType, "payment_received"),
        inArray(moneyEvents.clientId, clientIds),
        eq(
          sql<string>`to_char(${moneyEvents.occurredAt} AT TIME ZONE ${tz}, 'YYYY-MM')`,
          period,
        ),
      ),
    );

  const [dealRow] = await db
    .select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${deals.contractValueCents}), 0)`,
    })
    .from(deals)
    .where(
      and(
        inArray(deals.clientId, clientIds),
        isNotNull(deals.closedAt),
        eq(
          sql<string>`to_char(${deals.closedAt} AT TIME ZONE ${tz}, 'YYYY-MM')`,
          period,
        ),
      ),
    );

  return {
    cashCents: Number(cashRow?.total ?? 0),
    dealsClosed: Number(dealRow?.count ?? 0),
    revenueCents: Number(dealRow?.revenue ?? 0),
  };
}

/** Submitted EODs for the scope, one lean row per rep-day (CT day key). */
async function scopedEodDays(
  clientIds: string[],
  isAllOffers: boolean,
  tz: string,
): Promise<CoachEodDay[]> {
  const db = getDb();
  const where = isAllOffers
    ? eq(activityReports.kind, "eod")
    : clientIds.length > 0
      ? and(
          eq(activityReports.kind, "eod"),
          inArray(activityReports.clientId, clientIds),
        )
      : sql`false`;

  const rows = await db
    .select({
      repId: activityReports.repId,
      reportDate: activityReports.reportDate,
      metrics: activityReports.metrics,
    })
    .from(activityReports)
    .where(where);

  return rows.map((r) => ({
    repId: r.repId,
    dayKey: dayKeyIn(r.reportDate, tz),
    shows: metricNum(r.metrics, "shows"),
    noShows: metricNum(r.metrics, "no_shows"),
  }));
}

/** The Coach dashboard model for a resolved offer scope. */
export async function getCoachData(params: {
  scopeClientIds: string[];
  isAllOffers: boolean;
  scopeLabel: string;
  nowMs: number;
}): Promise<CoachModel> {
  const { scopeClientIds, isAllOffers, scopeLabel, nowMs } = params;
  const tz = await viewerTimeZone();
  const todayKey = dayKeyIn(new Date(nowMs), tz);
  const period = todayKey.slice(0, 7);
  const prevPeriod = prevMonth(period);
  const scopeSet = new Set(scopeClientIds);

  const [cur, prev, allQuotas, leaderboard, allReps, teams, eodDays] =
    await Promise.all([
      scopedMonthSales(scopeClientIds, period, tz),
      scopedMonthSales(scopeClientIds, prevPeriod, tz),
      listQuotasWithPacing(nowMs),
      getLeaderboard(),
      listReps(),
      listTeams(),
      scopedEodDays(scopeClientIds, isAllOffers, tz),
    ]);

  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const inScope = (clientId: string) => isAllOffers || scopeSet.has(clientId);

  const scopeRepIds = new Set(
    allReps
      .filter((r) => r.status === "active" && inScope(r.clientId))
      .map((r) => r.id),
  );

  const activeReps: CoachActiveRep[] = allReps
    .filter((r) => r.status === "active" && inScope(r.clientId))
    .map((r) => ({
      id: r.id,
      name: r.name,
      teamName: nameById.get(r.clientId) ?? null,
    }));

  const repStats: CoachRepStat[] = leaderboard
    .filter((r) => isAllOffers || scopeRepIds.has(r.repId))
    .map((r) => ({
      repId: r.repId,
      name: r.name,
      teamName: r.teamName,
      cashCents: r.cashCents,
      dealsClosed: r.dealsClosed,
      shows: r.shows,
    }));

  const quotas: CoachQuota[] = allQuotas
    .filter((q) => inScope(q.clientId))
    .map((q) => ({
      scope: q.scope,
      repName: q.repName,
      teamName: q.teamName,
      metricLabel: q.metricLabel,
      status: q.pacing.status,
      attainmentPct: q.pacing.attainmentPct,
      isPast: q.isPast,
    }));

  return buildCoachModel({
    isAllOffers,
    scopeLabel,
    monthCashCents: cur.cashCents,
    monthDealsClosed: cur.dealsClosed,
    monthRevenueCents: cur.revenueCents,
    prevMonthDealsClosed: prev.dealsClosed,
    quotas,
    reps: repStats,
    eodDays,
    activeReps,
    todayKey,
    period,
    prevPeriod,
  });
}

/** A logged call/booking, its label resolved, for the rep's recent activity. */
export interface WingmanActivity {
  id: string;
  title: string;
  sub: string | null;
  occurredAt: Date;
}

/** One of the rep's recent EOD submissions, the headline counts pulled out. */
export interface WingmanEod {
  id: string;
  reportDate: Date;
  dayKey: string;
  shows: number;
  dials: number;
  setsBooked: number;
  callsTaken: number;
}

/** The full Wingman board bundle for one rep. */
export interface WingmanData {
  rep: { id: string; name: string; role: string; teamName: string | null } | null;
  gamification: RepGamification | null;
  model: WingmanModel;
  recentActivity: WingmanActivity[];
  lastEods: WingmanEod[];
  /** The rep's offer's call board. Null when the rep is not scoped to an offer. */
  calls: CallQueue | null;
}

/**
 * The call board for the offer this rep works.
 *
 * Scoped by the REP'S OWN client_id, which is the only link between a rep and
 * an offer that exists. Bookings carry no rep, so this is deliberately the
 * offer's board rather than a personal assignment the data cannot support —
 * and the UI names it that way.
 *
 * Null only when the rep row itself is gone — a rep always belongs to an
 * offer. There is deliberately no agency-wide fallback: showing one offer's
 * setter every booking GV has taken would be worse than showing them nothing.
 */
async function repCallQueue(
  repId: string,
  now: Date,
  timeZone: string,
): Promise<CallQueue | null> {
  const db = getDb();
  const rep = (
    await db
      .select({ clientId: reps.clientId })
      .from(reps)
      .where(eq(reps.id, repId))
      .limit(1)
  )[0];
  if (!rep?.clientId) return null;

  const dayKey = dayKeyIn(now, timeZone);
  const dayStart = dayStartIn(dayKey, timeZone);
  const dayEnd = dayEndIn(dayKey, timeZone);

  // Everything from the start of today forward: the board never looks back, so
  // yesterday's rows are not fetched only to be filtered away.
  const rows = await db
    .select({
      id: bookings.id,
      inviteeName: bookings.inviteeName,
      eventType: bookings.eventType,
      startsAt: bookings.startsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, rep.clientId),
        // An undated booking has no start to compare, and it is counted, so it
        // has to survive the filter.
        sql`(${bookings.startsAt} is null or ${bookings.startsAt} >= ${dayStart})`,
      ),
    );

  return callQueue(rows, now, dayStart, dayEnd);
}

/** The rep's most recent logged activity, newest first. */
async function repRecentActivity(
  repId: string,
  limit: number,
): Promise<WingmanActivity[]> {
  const logs = await listCallLogs(200);
  return logs
    .filter((l) => l.repId === repId)
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      title: `${l.mode === "booking" ? "Booking" : callTypeLabel(l.callType ?? "call")} · ${dispositionLabel(l.disposition)}`,
      sub: l.customerName,
      occurredAt: l.occurredAt,
    }));
}

/** The rep's most recent EOD submissions, newest first. */
async function repRecentEods(repId: string, limit: number): Promise<WingmanEod[]> {
  const db = getDb();
  const tz = await viewerTimeZone();
  const rows = await db
    .select({
      id: activityReports.id,
      reportDate: activityReports.reportDate,
      metrics: activityReports.metrics,
    })
    .from(activityReports)
    .where(and(eq(activityReports.repId, repId), eq(activityReports.kind, "eod")))
    .orderBy(desc(activityReports.reportDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    reportDate: r.reportDate,
    dayKey: dayKeyIn(r.reportDate, tz),
    shows: metricNum(r.metrics, "shows"),
    dials: metricNum(r.metrics, "dials"),
    setsBooked: metricNum(r.metrics, "sets_booked"),
    callsTaken: metricNum(r.metrics, "calls_taken"),
  }));
}

/** The Wingman dashboard bundle for one signed-in rep. */
export async function getWingmanData(
  repId: string,
  nowMs: number,
): Promise<WingmanData> {
  const now = new Date(nowMs);
  const timeZone = await viewerTimeZone();
  const [gamView, allQuotas, rollup, recentActivity, lastEods, calls] =
    await Promise.all([
      getRepGamification(repId),
      listQuotasWithPacing(nowMs),
      getCommissionRollup(),
      repRecentActivity(repId, 6),
      repRecentEods(repId, 5),
      repCallQueue(repId, now, timeZone),
    ]);

  const myQuotas: WingmanQuota[] = allQuotas
    .filter((q) => q.scope === "rep" && q.repId === repId)
    .map((q) => ({
      id: q.id,
      metricKey: q.metric,
      metricLabel: q.metricLabel,
      isMoney: q.isMoney,
      targetAmount: q.targetAmount,
      actualSoFar: q.actualSoFar,
      attainmentPct: q.pacing.attainmentPct,
      remaining: q.pacing.remaining,
      status: q.pacing.status,
      isPast: q.isPast,
    }));

  let commission: WingmanCommission | null = null;
  const line = rollup.reps.find((r) => r.repId === repId);
  if (line) {
    const period = currentPayoutPeriod();
    const paid = await getPaidRepIds(period);
    commission = {
      owedCents: line.totalOwedCents,
      commissionCents: line.run.commissionCents,
      baseCents: line.run.baseCents,
      bonusCents: line.run.bonusCents,
      skimCents: line.skimCents,
      deals: line.run.dealCount,
      paid: paid.has(repId),
      period,
    };
  }

  const model = buildWingmanModel({
    hasActivity: gamView?.gamification.hasActivity ?? false,
    streak: {
      current: gamView?.gamification.streak.current ?? 0,
      longest: gamView?.gamification.streak.longest ?? 0,
    },
    pbCount: gamView?.gamification.personalBests.length ?? 0,
    quotas: myQuotas,
    commission,
  });

  return {
    rep: gamView ? gamView.rep : null,
    gamification: gamView ? gamView.gamification : null,
    model,
    recentActivity,
    lastEods,
    calls,
  };
}
