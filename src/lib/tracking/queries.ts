import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientTrackingRows, clientTrackingSyncs } from "@/db/schema/app";
import type { TabScan } from "@/lib/tracking/scan";
import type { TrackingTab } from "@/lib/tracking/tabs";

export interface TrackingSnapshot {
  syncId: string;
  spreadsheetId: string;
  syncedAt: Date;
  rowCount: number;
  tabs: TabScan[];
}

/** The current snapshot for a client, or null when it has never been synced. */
export async function currentSnapshot(
  clientId: string,
): Promise<TrackingSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(clientTrackingSyncs)
    .where(eq(clientTrackingSyncs.clientId, clientId))
    .orderBy(desc(clientTrackingSyncs.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    syncId: row.id,
    spreadsheetId: row.spreadsheetId,
    syncedAt: row.createdAt,
    rowCount: row.rowCount,
    tabs: (row.tabs ?? []) as unknown as TabScan[],
  };
}

export interface TabRow {
  rowIndex: number;
  occurredAt: Date | null;
  email: string | null;
  name: string | null;
  rep: string | null;
  status: string | null;
  outcome: string | null;
  cashCents: number | null;
  revenueCents: number | null;
  recordingUrl: string | null;
  notes: string | null;
  payload: Record<string, string>;
}

/** Rows of one tab from the CURRENT snapshot, newest first. */
export async function rowsForTab(
  syncId: string,
  tab: TrackingTab,
  limit = 200,
): Promise<TabRow[]> {
  const db = getDb();
  return db
    .select({
      rowIndex: clientTrackingRows.rowIndex,
      occurredAt: clientTrackingRows.occurredAt,
      email: clientTrackingRows.email,
      name: clientTrackingRows.name,
      rep: clientTrackingRows.rep,
      status: clientTrackingRows.status,
      outcome: clientTrackingRows.outcome,
      cashCents: clientTrackingRows.cashCents,
      revenueCents: clientTrackingRows.revenueCents,
      recordingUrl: clientTrackingRows.recordingUrl,
      notes: clientTrackingRows.notes,
      payload: clientTrackingRows.payload,
    })
    .from(clientTrackingRows)
    .where(and(eq(clientTrackingRows.syncId, syncId), eq(clientTrackingRows.tab, tab)))
    .orderBy(desc(clientTrackingRows.occurredAt), desc(clientTrackingRows.rowIndex))
    .limit(limit);
}

/**
 * EOC reports carrying a recording link — the queue for transcript analysis.
 * Ordered oldest-first so a backlog is worked in the order it happened.
 */
export async function eocWithRecordings(syncId: string, limit = 500) {
  const db = getDb();
  return db
    .select({
      rowIndex: clientTrackingRows.rowIndex,
      occurredAt: clientTrackingRows.occurredAt,
      email: clientTrackingRows.email,
      rep: clientTrackingRows.rep,
      status: clientTrackingRows.status,
      notes: clientTrackingRows.notes,
      recordingUrl: clientTrackingRows.recordingUrl,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        eq(clientTrackingRows.tab, "eoc"),
        isNotNull(clientTrackingRows.recordingUrl),
      ),
    )
    .orderBy(clientTrackingRows.occurredAt)
    .limit(limit);
}

/** How many rows the snapshot holds per tab. */
export async function rowCountsByTab(syncId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ tab: clientTrackingRows.tab, n: sql<number>`count(*)::int` })
    .from(clientTrackingRows)
    .where(eq(clientTrackingRows.syncId, syncId))
    .groupBy(clientTrackingRows.tab);
  return Object.fromEntries(rows.map((r) => [r.tab, r.n]));
}
