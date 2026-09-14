import { dedupePaymentRows } from "@/lib/tracking/payment-dedupe";
import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, clientTrackingRows, clientTrackingSyncs } from "@/db/schema/app";
import type { TabScan } from "@/lib/tracking/scan";
import { buildLeadSummaries, LEAD_TABS, type LeadSummary } from "@/lib/tracking/leads";
import {
  paymentKind,
  paymentLabel,
  paymentProvider,
} from "@/lib/tracking/payment-fields";
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

/**
 * The latest snapshot per source that has EVER written for this client.
 *
 * DISTINCT ON (source), newest first — the money headline wins from the Stripe
 * snapshot here, so this must find it whatever the row volume. The old query
 * read the 50 most-recent rows and then deduped by source in JS: if pruning
 * ever failed and one source (a hand-logged sheet) synced heavily, the
 * once-a-day Stripe snapshot could fall outside that 50-row window and vanish,
 * silently dropping the money feed back to the sheet/empty. Pushing the
 * latest-per-source to the database — one row per source via the
 * (client_id, source, created_at) index — is correct regardless of how many
 * rows any single source has written.
 */
export async function latestSnapshotsBySource(
  clientId: string,
): Promise<{ source: FactSource; snapshot: TrackingSnapshot }[]> {
  const db = getDb();
  const rows = await db
    .selectDistinctOn([clientTrackingSyncs.source])
    .from(clientTrackingSyncs)
    .where(eq(clientTrackingSyncs.clientId, clientId))
    // DISTINCT ON keeps the first row of each `source` group; ordering that
    // group by createdAt DESC makes "first" mean "newest". The leading order
    // key MUST be the distinct-on column, so source comes before createdAt.
    .orderBy(clientTrackingSyncs.source, desc(clientTrackingSyncs.createdAt));
  return rows.map((row) => ({
    source: row.source as FactSource,
    snapshot: {
      syncId: row.id,
      spreadsheetId: row.spreadsheetId,
      syncedAt: row.createdAt,
      rowCount: row.rowCount,
      tabs: (row.tabs ?? []) as unknown as TabScan[],
    },
  }));
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
  /** Extra inboxes that are the SAME person (the alias layer) — their rows
   * merge into one journey instead of splitting across pages. */
  aliasEmails: string[] = [],
): Promise<LeadSummary | null> {
  const wanted = email.trim().toLowerCase();
  if (wanted === "") return null;
  const inboxes = [
    wanted,
    ...aliasEmails.map((e) => e.trim().toLowerCase()).filter((e) => e && e !== wanted),
  ];
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
        inArray(clientTrackingRows.email, inboxes),
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
      revenueCents: clientTrackingRows.revenueCents,
      status: clientTrackingRows.status,
      occurredAt: clientTrackingRows.occurredAt,
      payload: clientTrackingRows.payload,
      source: clientTrackingRows.source,
      notes: clientTrackingRows.notes,
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
        revenueCents: r.revenueCents,
        program: r.payload?.["Program Sold"] ?? null,
        // The sheet's own wording for the close/deal type, whichever header
        // it used — feeds the paid-in-full / split / deposit classifier.
        closeType:
          r.payload?.["Deal Type"] ??
          r.payload?.["Close Type"] ??
          r.payload?.["Type"] ??
          null,
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
      // What tag rules read — the same three words across sheet and processor
      // rows. Extra fields only: nothing above them changes.
      label: paymentLabel(r.payload, r.notes),
      provider: paymentProvider(r.payload, r.source),
      kind: paymentKind(
        r.payload,
        r.cashCents,
        r.status ?? r.payload?.["Status"] ?? null,
      ),
    })),
  };
}
