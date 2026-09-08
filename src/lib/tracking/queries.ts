import { dedupePaymentRows } from "@/lib/tracking/payment-dedupe";
import "server-only";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, clientTrackingRows, clientTrackingSyncs } from "@/db/schema/app";
import type { TabScan } from "@/lib/tracking/scan";
import { buildLeadSummaries, LEAD_TABS, type LeadSummary } from "@/lib/tracking/leads";
import type { FactSource } from "@/lib/tracking/sources";
import type { TrackingTab } from "@/lib/tracking/tabs";

export interface TrackingSnapshot {
  syncId: string;
  spreadsheetId: string;
  syncedAt: Date;
  rowCount: number;
  tabs: TabScan[];
}

/**
 * The current snapshot for a client, or null when it has never been synced
 * FROM THE SHEET IT IS CONFIGURED WITH.
 *
 * The sheet id matters, not just the client. Offers get a new tracking sheet —
 * a fresh one each month, a rebuilt one after a mistake — and the moment the
 * id changes, every snapshot taken from the old sheet is history. Returning
 * the newest snapshot regardless of its source meant that if the first sync of
 * a new sheet failed, the workspace would keep showing LAST SHEET'S numbers
 * under the new sheet's name, and nothing on screen would say so.
 *
 * Matching on the configured id makes the failure honest instead: no snapshot
 * from this sheet yet, so the page says it hasn't synced.
 */
export async function currentSnapshot(
  clientId: string,
  /** Which system's snapshot. The sheet is the default. */
  source: FactSource = "sheet",
): Promise<TrackingSnapshot | null> {
  const db = getDb();

  // The connection-ref guard is a SHEET rule: it stops the app reading a
  // snapshot of a previously-linked, different spreadsheet after a swap. An
  // API source's ref is its integration, not the sheet — filtering Stripe's
  // snapshot by the sheet id made it unfindable by construction, and a
  // sheet-less offer (Base 44 through a processor) could never read at all.
  let connectionRef: string | null = null;
  if (source === "sheet") {
    const [client] = await db
      .select({ sheet: clients.trackingSheetId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    // No sheet linked: no sheet snapshot is current, whatever history exists.
    if (!client?.sheet) return null;
    connectionRef = client.sheet;
  }

  const [row] = await db
    .select()
    .from(clientTrackingSyncs)
    .where(
      and(
        eq(clientTrackingSyncs.clientId, clientId),
        eq(clientTrackingSyncs.source, source),
        ...(connectionRef !== null
          ? [eq(clientTrackingSyncs.spreadsheetId, connectionRef)]
          : []),
      ),
    )
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

/** The latest snapshot per source that has EVER written for this client. */
export async function latestSnapshotsBySource(
  clientId: string,
): Promise<{ source: FactSource; snapshot: TrackingSnapshot }[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(clientTrackingSyncs)
    .where(eq(clientTrackingSyncs.clientId, clientId))
    .orderBy(desc(clientTrackingSyncs.createdAt))
    .limit(50);
  const seen = new Set<string>();
  const out: { source: FactSource; snapshot: TrackingSnapshot }[] = [];
  for (const row of rows) {
    if (seen.has(row.source)) continue;
    seen.add(row.source);
    out.push({
      source: row.source as FactSource,
      snapshot: {
        syncId: row.id,
        spreadsheetId: row.spreadsheetId,
        syncedAt: row.createdAt,
        rowCount: row.rowCount,
        tabs: (row.tabs ?? []) as unknown as TabScan[],
      },
    });
  }
  return out;
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

/** EOD rows from the current snapshot, for the floor's activity picture. */
export async function eodRowsForClient(syncId: string) {
  const db = getDb();
  return db
    .select({
      tab: clientTrackingRows.tab,
      rep: clientTrackingRows.rep,
      occurredAt: clientTrackingRows.occurredAt,
      payload: clientTrackingRows.payload,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        inArray(clientTrackingRows.tab, ["setter_eod", "dm_setter_eod", "closer_eod"]),
      ),
    )
    .orderBy(desc(clientTrackingRows.occurredAt));
}

/** The deal and payment rows behind an offer's cash, for reconciliation. */
export async function cashRowsForClient(syncId: string) {
  const db = getDb();
  const rows = await db
    .select({
      tab: clientTrackingRows.tab,
      email: clientTrackingRows.email,
      phone: clientTrackingRows.phone,
      cashCents: clientTrackingRows.cashCents,
      status: clientTrackingRows.status,
      occurredAt: clientTrackingRows.occurredAt,
      payload: clientTrackingRows.payload,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        inArray(clientTrackingRows.tab, ["deals", "payments"]),
      ),
    );
  return {
    deals: rows
      .filter((r) => r.tab === "deals")
      .map((r) => ({
        email: r.email,
        cashCents: r.cashCents,
        program: r.payload?.["Program Sold"] ?? null,
        occurredAt: r.occurredAt,
      })),
    // Duplicate transaction ids collapse to one row — a hand-kept log
    // repeating a charge must not double the month.
    payments: dedupePaymentRows(rows.filter((r) => r.tab === "payments")).map((r) => ({
      email: r.email,
      phone: r.phone,
      occurredAt: r.occurredAt,
      cashCents: r.cashCents,
      processor: r.payload?.["Processor"] ?? null,
      // The processor's own word for what happened — succeeded, refunded,
      // failed. Without it a refunded charge counts as cash collected.
      status: r.status ?? r.payload?.["Status"] ?? null,
    })),
  };
}
