import "server-only";

import { desc } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  clients,
  notifications,
  offerSettings,
  sheetSyncRuns,
  signedDocs,
} from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { bodRule, driftRule, signedDocRule } from "@/lib/notifications/rules";
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
  const [[latestRun], docs, clientRows, settingsRows, { rows: backlog }] =
    await Promise.all([
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
        .select({ id: clients.id, slug: clients.slug, name: clients.name })
        .from(clients),
      db
        .select({
          clientId: offerSettings.clientId,
          bodAlertTime: offerSettings.bodAlertTime,
          timezone: offerSettings.timezone,
        })
        .from(offerSettings),
      listTransactions({}),
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

  // Sync-failure + staleness alerts are OFF until integrations carry real
  // traffic (Daniel: the placeholder "Kit sync failing" note is meaningless
  // noise). Re-enable both — with human-readable copy — once real keys land.
  const candidates = [
    ...driftRule(latestRun ?? null),
    ...signedDocRule(docs),
    ...bodRule(bodOffers, now, todayKey),
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
