import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  activityLogs,
  activityReports,
  clients,
  deals,
  profiles,
  reps,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { dayKeyCT } from "@/lib/charts";
import {
  type RepGamification,
  type RepGamificationInput,
  computeRepGamification,
} from "@/lib/gamification/engine";

/**
 * The gamification read layer.
 *
 * Server-only functions that turn real rows — submitted EODs, logged calls, and
 * closed deals with their ledger cash — into the pure engine's inputs. Nothing
 * here invents a number: a rep with no history yields an empty bundle, and the
 * page shows an honest empty state. All the math lives in the fully covered
 * engine module; this file only groups rows and hands them over.
 *
 * "now" is read once as a real Date (never Date.now) and passed down as a CT
 * day key, so the day boundaries match the rest of the app.
 */

/**
 * The activity counts that make a day "busy" on the heatmap. Cash is money in,
 * not effort, so it feeds the record book but never the heatmap or the streak.
 */
const ACTIVITY_VOLUME_KEYS = [
  "dials",
  "connects",
  "dms_sent",
  "sets_booked",
  "calls_taken",
  "shows",
  "follow_up_calls",
];

/** The raw rows for one rep, already filtered to that rep. */
interface RepRows {
  reports: { reportDate: Date; metrics: Record<string, number> }[];
  logOccurredAt: Date[];
  dealClosedAt: (Date | null)[];
  cashEvents: { occurredAt: Date; amountCents: number }[];
}

/** Group real rows into the shape the pure engine consumes. */
function assembleInputs(rows: RepRows, now: Date): RepGamificationInput {
  const active = new Set<string>();
  const dayMetrics = new Map<string, Record<string, number>>();
  const activity = new Map<string, number>();

  const metricsFor = (key: string): Record<string, number> => {
    let m = dayMetrics.get(key);
    if (!m) {
      m = {};
      dayMetrics.set(key, m);
    }
    return m;
  };
  const addActivity = (key: string, delta: number) => {
    activity.set(key, (activity.get(key) ?? 0) + delta);
  };

  // Submitted EODs: an active day, their metrics, and their activity volume.
  for (const r of rows.reports) {
    const key = dayKeyCT(r.reportDate);
    active.add(key);
    const m = metricsFor(key);
    let volume = 0;
    for (const [k, v] of Object.entries(r.metrics ?? {})) {
      if (typeof v !== "number") continue;
      m[k] = (m[k] ?? 0) + v;
      if (ACTIVITY_VOLUME_KEYS.includes(k)) volume += v;
    }
    addActivity(key, volume);
  }

  // Logged calls / bookings: one unit of activity each.
  for (const at of rows.logOccurredAt) {
    const key = dayKeyCT(at);
    active.add(key);
    addActivity(key, 1);
  }

  // Closed deals: an active day, a close on the record book, a unit of activity.
  for (const closedAt of rows.dealClosedAt) {
    if (!closedAt) continue;
    const key = dayKeyCT(closedAt);
    active.add(key);
    const m = metricsFor(key);
    m.deals_closed = (m.deals_closed ?? 0) + 1;
    addActivity(key, 1);
  }

  // Collected cash: feeds the "best cash day" record only.
  for (const ev of rows.cashEvents) {
    const key = dayKeyCT(ev.occurredAt);
    const m = metricsFor(key);
    m.cash = (m.cash ?? 0) + ev.amountCents;
  }

  return {
    todayKey: dayKeyCT(now),
    activeDayKeys: [...active],
    dayMetrics: [...dayMetrics.entries()].map(([dayKey, metrics]) => ({
      dayKey,
      metrics,
    })),
    dailyActivity: [...activity.entries()].map(([dayKey, value]) => ({
      dayKey,
      value,
    })),
  };
}

/** A rep header plus their full gamification bundle. */
export interface RepGamificationView {
  rep: { id: string; name: string; role: string; teamName: string | null };
  gamification: RepGamification;
}

/**
 * One rep's streak, personal bests, and heatmap, all derived from real rows.
 * Null when no such rep exists.
 */
export async function getRepGamification(
  repId: string,
): Promise<RepGamificationView | null> {
  const db = getDb();
  const [rep] = await db
    .select({
      id: reps.id,
      name: reps.name,
      role: reps.role,
      teamName: clients.name,
    })
    .from(reps)
    .leftJoin(clients, eq(reps.clientId, clients.id))
    .where(eq(reps.id, repId))
    .limit(1);
  if (!rep) return null;

  const [reportRows, logRows, dealRows] = await Promise.all([
    db
      .select({
        reportDate: activityReports.reportDate,
        metrics: activityReports.metrics,
      })
      .from(activityReports)
      .where(and(eq(activityReports.repId, repId), eq(activityReports.kind, "eod"))),
    db
      .select({ occurredAt: activityLogs.occurredAt })
      .from(activityLogs)
      .where(eq(activityLogs.repId, repId)),
    db
      .select({ id: deals.id, closedAt: deals.closedAt })
      .from(deals)
      .where(eq(deals.repId, repId)),
  ]);

  const dealIds = dealRows.map((d) => d.id);
  const cashEvents = dealIds.length
    ? await db
        .select({
          occurredAt: moneyEvents.occurredAt,
          amountCents: moneyEvents.amountCents,
        })
        .from(moneyEvents)
        .where(
          and(
            inArray(moneyEvents.dealId, dealIds),
            eq(moneyEvents.eventType, "payment_received"),
          ),
        )
    : [];

  const now = new Date();
  const gamification = computeRepGamification(
    assembleInputs(
      {
        reports: reportRows,
        logOccurredAt: logRows.map((r) => r.occurredAt),
        dealClosedAt: dealRows.map((d) => d.closedAt),
        cashEvents,
      },
      now,
    ),
  );

  return { rep, gamification };
}

/** A compact momentum line for the team board. */
export interface RepMomentum {
  repId: string;
  name: string;
  role: string;
  teamName: string | null;
  currentStreak: number;
  longestStreak: number;
  personalBestCount: number;
  hasActivity: boolean;
}

/**
 * Every active rep's streak + personal-best count, ranked by who is on the
 * longest current run. Reps with no activity fall to the bottom with an honest
 * zero — never a fabricated streak.
 */
export async function listRepMomentum(): Promise<RepMomentum[]> {
  const db = getDb();
  const repRows = await db
    .select({
      id: reps.id,
      name: reps.name,
      role: reps.role,
      teamName: clients.name,
    })
    .from(reps)
    .leftJoin(clients, eq(reps.clientId, clients.id))
    .where(eq(reps.status, "active"));
  if (repRows.length === 0) return [];

  const [reportRows, logRows, dealRows] = await Promise.all([
    db
      .select({
        repId: activityReports.repId,
        reportDate: activityReports.reportDate,
        metrics: activityReports.metrics,
      })
      .from(activityReports)
      .where(eq(activityReports.kind, "eod")),
    db
      .select({ repId: activityLogs.repId, occurredAt: activityLogs.occurredAt })
      .from(activityLogs),
    db
      .select({ id: deals.id, repId: deals.repId, closedAt: deals.closedAt })
      .from(deals),
  ]);

  const dealIds = dealRows.map((d) => d.id);
  const cashRows = dealIds.length
    ? await db
        .select({
          dealId: moneyEvents.dealId,
          occurredAt: moneyEvents.occurredAt,
          amountCents: moneyEvents.amountCents,
        })
        .from(moneyEvents)
        .where(
          and(
            inArray(moneyEvents.dealId, dealIds),
            eq(moneyEvents.eventType, "payment_received"),
          ),
        )
    : [];
  const repByDeal = new Map<string, string>();
  for (const d of dealRows) {
    if (d.repId) repByDeal.set(d.id, d.repId);
  }

  // Group every row by rep so each gets its own inputs.
  const byRep = new Map<string, RepRows>();
  const rowsFor = (repId: string): RepRows => {
    let r = byRep.get(repId);
    if (!r) {
      r = { reports: [], logOccurredAt: [], dealClosedAt: [], cashEvents: [] };
      byRep.set(repId, r);
    }
    return r;
  };
  for (const r of reportRows) {
    if (r.repId)
      rowsFor(r.repId).reports.push({ reportDate: r.reportDate, metrics: r.metrics });
  }
  for (const l of logRows) {
    if (l.repId) rowsFor(l.repId).logOccurredAt.push(l.occurredAt);
  }
  for (const d of dealRows) {
    if (d.repId) rowsFor(d.repId).dealClosedAt.push(d.closedAt);
  }
  for (const c of cashRows) {
    const repId = c.dealId ? repByDeal.get(c.dealId) : undefined;
    if (repId) {
      rowsFor(repId).cashEvents.push({
        occurredAt: c.occurredAt,
        amountCents: c.amountCents,
      });
    }
  }

  const now = new Date();
  const empty: RepRows = {
    reports: [],
    logOccurredAt: [],
    dealClosedAt: [],
    cashEvents: [],
  };
  const momentum: RepMomentum[] = repRows.map((rep) => {
    const g = computeRepGamification(assembleInputs(byRep.get(rep.id) ?? empty, now));
    return {
      repId: rep.id,
      name: rep.name,
      role: rep.role,
      teamName: rep.teamName,
      currentStreak: g.streak.current,
      longestStreak: g.streak.longest,
      personalBestCount: g.personalBests.length,
      hasActivity: g.hasActivity,
    };
  });

  momentum.sort(
    (a, b) =>
      b.currentStreak - a.currentStreak ||
      b.longestStreak - a.longestStreak ||
      b.personalBestCount - a.personalBestCount ||
      a.name.localeCompare(b.name),
  );
  return momentum;
}

/** The active rep linked to a signed-in email, or null. Drives the profile card. */
export async function getRepForEmail(
  email: string,
): Promise<{ id: string; name: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: reps.id, name: reps.name })
    .from(reps)
    .innerJoin(profiles, eq(reps.profileId, profiles.id))
    .where(and(eq(profiles.email, email), eq(reps.status, "active")))
    .limit(1);
  return row ?? null;
}
