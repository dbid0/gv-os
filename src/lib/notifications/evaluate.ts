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
import { liveSpeedToLead } from "@/lib/crm/speed-to-lead-live";
import { buildAlertBatchMessage, type AlertNotification } from "@/lib/discord/embed";
import { postToAgencyDiscord } from "@/lib/discord/webhook";
import { fileNewNotifications } from "@/lib/notifications/store";
import {
  bodReminderRule,
  callReviewRule,
  bodRule,
  driftRule,
  eodReminderRule,
  paymentFailureRule,
  repWellbeingRule,
  signedDocRule,
  speedToLeadBreachRule,
  spineDriftRule,
  type Candidate,
  type PaymentFailureState,
  type RepWellbeingState,
  type SpeedToLeadBreachState,
  type SpineDriftRow,
} from "@/lib/notifications/rules";
import { getAgencyReconciliation } from "@/lib/accounting/reconcile-agency-query";
import { getSpineReconciliation } from "@/lib/accounting/reconcile-spine-query";
import { listRecoveryRows } from "@/lib/payments/recovery-store";
import { getEodCompliance } from "@/lib/sales/queries";
import { loadRoster } from "@/lib/roster-server";
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
  const roster = await loadRoster();
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
    db
      .select({
        id: clients.id,
        slug: clients.slug,
        name: clients.name,
        status: clients.status,
      })
      .from(clients),
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
  // Looked up once for the Discord delivery step further down, so a fired
  // alert's clientId can be turned back into a name without a second query.
  const clientById = new Map(clientRows.map((r) => [r.id, r]));

  // Calls the read says need a manager, the failed-payment recovery inbox,
  // and live speed-to-lead breaches — read here rather than in the rules so
  // the rules themselves stay pure and testable.
  const [reviews, recoveryRows, stlByClient] = await Promise.all([
    reviewQueue({ limit: 50 }),
    // Failed-payment recovery inbox — the "open" rows are untouched failures
    // (see recovery.ts: chasing/written_off/recovered are all human decisions
    // already made, so they never page again).
    listRecoveryRows(),
    // Speed-to-lead, LIVE, per active offer. Archived clients are skipped —
    // they never carry a real breach worth paging on. `liveSpeedToLead`
    // itself short-circuits to `connected: false` (one cheap query) for any
    // offer that doesn't have BOTH Close and Typeform wired, so this stays
    // affordable even as the roster grows.
    Promise.all(
      clientRows
        .filter((c) => c.status === "active")
        .map(async (c) => ({ client: c, live: await liveSpeedToLead(c.id) })),
    ),
  ]);

  const paymentFailures: PaymentFailureState[] = recoveryRows
    .filter((r) => r.effectiveStatus === "open")
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName,
      amountCents: r.amountCents,
      provider: r.provider,
      failureMessage: r.failureMessage,
    }));

  const speedToLeadBreaches: SpeedToLeadBreachState[] = stlByClient.flatMap(
    ({ client, live }) =>
      live.connected
        ? live.liveBreaches.map((b) => ({
            applicationKey: `${client.id}:${b.email}:${b.submittedAtMs}`,
            clientId: client.id,
            clientName: client.name,
            email: b.email,
            name: b.name,
            waitingSec: b.waitingSec,
          }))
        : [],
  );

  const candidates = [
    ...driftRule(latestRun ?? null, todayKey),
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
    ...paymentFailureRule(paymentFailures),
    ...speedToLeadBreachRule(speedToLeadBreaches),
  ];

  // Filed in one statement; only the genuinely new ones come back, which is
  // what decides who gets paged. See lib/notifications/store.
  const created = await fileNewNotifications(candidates);

  // Deliver the newly-fired alerts to the agency Discord — warning/critical
  // only, batched into one post. Info-level rows (a signed agreement, the
  // BOD digest) stay in-app; they're good news or routine, not a page.
  // Soft-fail: no connected Discord credential, or a Discord outage, must
  // never undo the inserts above or fail the sync that called this — the
  // alerts are already safely in /notifications either way.
  const pageable = created.filter((c) => c.severity !== "info");
  if (pageable.length > 0) {
    try {
      const alerts: AlertNotification[] = pageable.map((c) => ({
        severity: c.severity,
        title: c.title,
        body: c.body,
        clientName: c.clientId ? (clientById.get(c.clientId)?.name ?? null) : null,
      }));
      await postToAgencyDiscord(buildAlertBatchMessage(alerts));
    } catch {
      // No connected webhook yet, or Discord rejected the post — never lets
      // a delivery failure look like an evaluation failure.
    }
  }

  return { candidates: candidates.length, created: created.length };
}
