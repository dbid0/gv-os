import "server-only";

import { desc } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  integrations,
  notifications,
  sheetSyncRuns,
  signedDocs,
} from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import {
  driftRule,
  signedDocRule,
  stalenessRule,
  syncFailureRule,
} from "@/lib/notifications/rules";

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
  const [connections, [latestRun], docs] = await Promise.all([
    db
      .select({
        id: integrations.id,
        provider: integrations.provider,
        label: integrations.label,
        clientId: integrations.clientId,
        lastSyncAt: integrations.lastSyncAt,
        lastSyncNote: integrations.lastSyncNote,
        status: integrations.status,
      })
      .from(integrations),
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
  ]);

  const connected = connections.filter((c) => c.status === "connected");
  const candidates = [
    ...syncFailureRule(connected),
    ...stalenessRule(connected, now, dayKeyCT(now)),
    ...driftRule(latestRun ?? null),
    ...signedDocRule(docs),
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
