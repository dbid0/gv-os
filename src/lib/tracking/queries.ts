import "server-only";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientTrackingRows, clientTrackingSyncs } from "@/db/schema/app";
import type { TabScan } from "@/lib/tracking/scan";
import { buildLeadSummaries, LEAD_TABS, type LeadSummary } from "@/lib/tracking/leads";
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

/**
 * Every lead in the current snapshot, stitched across the lead-bearing tabs.
 *
 * Reads only the tabs that carry a lead email; the BOD/EOD tabs describe a
 * rep's day and are excluded at the query so they can't be joined by accident.
 */
export async function leadsForClient(syncId: string): Promise<LeadSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      tab: clientTrackingRows.tab,
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
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        isNotNull(clientTrackingRows.email),
        inArray(clientTrackingRows.tab, LEAD_TABS),
      ),
    );
  return buildLeadSummaries(rows);
}

/**
 * One lead's full journey, or null when that email isn't in the snapshot.
 *
 * Queries only THAT lead's rows. It used to build summaries for every lead on
 * the offer and then pick one out — 435 people's journeys assembled to render
 * a single page.
 */
export async function leadByEmail(
  syncId: string,
  email: string,
): Promise<LeadSummary | null> {
  const wanted = email.trim().toLowerCase();
  if (wanted === "") return null;
  const db = getDb();
  const rows = await db
    .select({
      tab: clientTrackingRows.tab,
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
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        eq(clientTrackingRows.email, wanted),
        inArray(clientTrackingRows.tab, LEAD_TABS),
      ),
    );
  // The same builder as the list, so one lead's page and their row in the
  // table can never disagree.
  return buildLeadSummaries(rows)[0] ?? null;
}
