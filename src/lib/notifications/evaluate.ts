import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  activityReports,
  clients,
  notifications,
  offerSettings,
  reps,
  sheetSyncRuns,
  signedDocs,
} from "@/db/schema/app";
import { reviewQueue } from "@/lib/calls/review-queue";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import {
  bodReminderRule,
  callReviewRule,
  bodRule,
  driftRule,
  eodReminderRule,
  repWellbeingRule,
  signedDocRule,
  spineDriftRule,
  type RepWellbeingState,
  type SpineDriftRow,
} from "@/lib/notifications/rules";
import { getAgencyReconciliation } from "@/lib/accounting/reconcile-agency-query";
import { getSpineReconciliation } from "@/lib/accounting/reconcile-spine-query";
import { getEodCompliance } from "@/lib/sales/queries";
import { roster } from "@/lib/roster";
import { homeRangeRows, rangeBounds } from "@/lib/transactions/homepage";
import { clientLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";

/**
 * Gather state, run every rule, insert candidates idempotently. Safe to run
 * as often as the crons like — the dedupe keys make replays free.
 */
export async function evaluateNotifications(): Promise<{
  candidates: number;
  created: number;
}> {
  const db = getDb();
  const now = new Date();
  const [
    [latestRun],
    docs,
    clientRows,
    settingsRows,
    { rows: backlog },
    moodRows,
    eodCompliance,
    bodCompliance,
  ] = await Promise.all([
    db
      .select({
        id: sheetSyncRuns.id,
        driftRowCount: sheetSyncRuns.driftRowCount,
        totalAbsDriftCents: sheetSyncRuns.totalAbsDriftCents,
      })
      .from(sheetSyncRuns)
      .orderBy(desc(sheetSyncRuns.createdAt))
      .limit(1),
    db
      .select({
        externalId: signedDocs.externalId,
        name: signedDocs.name,
        clientId: signedDocs.clientId,
        completedAt: signedDocs.completedAt,
      })
      .from(signedDocs)
      .orderBy(desc(signedDocs.createdAt))
      .limit(100),
    db.select({ id: clients.id, slug: clients.slug, name: clients.name }).from(clients),
    db
      .select({
        clientId: offerSettings.clientId,
        bodAlertTime: offerSettings.bodAlertTime,
        timezone: offerSettings.timezone,
      })
      .from(offerSettings),
    listTransactions({}),
    // Recent EOD submissions with their self-reported check-in score, for the
    // rep-wellbeing alert. Filtered to today in JS after the day key is known.
    db
      .select({
        repId: activityReports.repId,
        repName: reps.name,
        clientId: activityReports.clientId,
        teamName: clients.name,
        reportDate: activityReports.reportDate,
        metrics: activityReports.metrics,
      })
      .from(activityReports)
      .leftJoin(reps, eq(activityReports.repId, reps.id))
      .leftJoin(clients, eq(activityReports.clientId, clients.id))
      .where(eq(activityReports.kind, "eod"))
      .orderBy(desc(activityReports.createdAt))
      .limit(200),
    // EOD/BOD compliance for the daily missing-report reminders.
    getEodCompliance("eod"),
    getEodCompliance("bod"),
  ]);

  // BOD digests: every active offer, schema defaults standing in for offers
  // with no settings row yet (v2 defaults: 12:00 America/Chicago). A null
  // alert time on a saved row means the alert is off.
  const todayKey = dayKeyCT(now);
  const settingsByClient = new Map(settingsRows.map((r) => [r.clientId, r]));
  const mtdBySlug = new Map(
    clientLedger(
      homeRangeRows(backlog, "clients", rangeBounds("month", todayKey)),
      roster.map((c) => ({ slug: c.slug, name: c.name })),
      matchesSheetClient,
    ).map((line) => [line.slug, line.cashCents]),
  );
  const bodOffers = roster.flatMap((c) => {
    const row = clientRows.find((r) => r.slug === c.slug);
    if (!row) return [];
    const saved = settingsByClient.get(row.id);
    const bodAlertTime = saved ? saved.bodAlertTime : "12:00";
    if (!bodAlertTime) return [];
    return [
      {
        clientId: row.id,
        slug: c.slug,
        name: c.name,
        bodAlertTime,
        timezone: saved?.timezone ?? "America/Chicago",
        mtdCashCents: mtdBySlug.get(c.slug) ?? 0,
      },
    ];
  });

  // Money Spine drift — the reconciler's "can't fail unnoticed" alert. Both
  // the offer book and GV's own agency book.
  const [spine, agency] = await Promise.all([
    getSpineReconciliation(),
    getAgencyReconciliation(),
  ]);
  const driftRows: SpineDriftRow[] = [
    ...spine.rows
      .filter((r) => r.status === "drift")
      .map((r) => ({
        scope: r.slug,
        name: r.name,
        month: r.month,
        cashDeltaCents: r.cashDeltaCents,
      })),
    ...agency.rows
      .filter((r) => r.status === "drift")
      .map((r) => ({
        scope: "agency",
        name: "Agency book",
        month: r.month,
        cashDeltaCents: r.driftCents,
      })),
  ];

  // Rep wellbeing: any EOD filed today with a check-in score below 3 nudges
  // the manager to reach out. One alert per rep per day (dedupe carries the day).
  const wellbeingRows: RepWellbeingState[] = moodRows
    .filter((r) => r.repId && dayKeyCT(new Date(r.reportDate)) === todayKey)
    .map((r) => ({
      repId: r.repId,
      repName: r.repName ?? "A rep",
      clientId: r.clientId,
      teamName: r.teamName,
      score: Number(r.metrics?.mood ?? 0),
      dateKey: todayKey,
    }));

  // Sync-failure + staleness alerts are OFF until integrations carry real
  // traffic (Daniel: the placeholder "Kit sync failing" note is meaningless
  // noise). Re-enable both — with human-readable copy — once real keys land.
  // Calls the read says need a manager. Read here rather than in the rule so
  // the rule itself stays pure and testable.
  const reviews = await reviewQueue({ limit: 50 });

  const candidates = [
    ...driftRule(latestRun ?? null),
    ...spineDriftRule(driftRows),
    ...signedDocRule(docs),
    ...bodRule(bodOffers, now, todayKey),
    ...repWellbeingRule(wellbeingRows),
    ...bodReminderRule(bodCompliance, now, todayKey),
    ...eodReminderRule(eodCompliance, now, todayKey),
    ...callReviewRule(
      reviews.map((r) => ({
        recordingId: r.recordingId,
        clientId: r.clientId,
        rep: r.rep,
        reason: r.decision.reason ?? "Needs a look",
        priority: r.decision.priority,
      })),
    ),
  ];

  let created = 0;
  for (const c of candidates) {
    const inserted = await db
      .insert(notifications)
      .values(c)
      .onConflictDoNothing({ target: [notifications.dedupeKey] })
      .returning({ id: notifications.id });
    if (inserted.length > 0) created += 1;
  }
  return { candidates: candidates.length, created };
}
