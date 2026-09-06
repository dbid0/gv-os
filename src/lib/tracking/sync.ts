import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  clientColumnMap,
  clients,
  clientTrackingRows,
  clientTrackingSyncs,
} from "@/db/schema/app";
import { readSheetTitles, readSheetValues } from "@/lib/google/sheets";
import type { LearnedAlias } from "@/lib/tracking/fields";
import { writeSourceSnapshot } from "@/lib/tracking/ingest";
import { parseTrackingTab, type TrackingRow } from "@/lib/tracking/parse";
import { scanTab, type TabScan } from "@/lib/tracking/scan";
import { tabFromTitle } from "@/lib/tracking/tabs";

/** How far down a tab is read. The live sheets sit near 1,100 used rows. */
const MAX_ROWS = 5000;

export interface TrackingSyncResult {
  syncId: string | null;
  rowCount: number;
  tabs: TabScan[];
  /** Set when the pull could not run at all; no rows are written then. */
  error: string | null;
}

/**
 * Pull one client's Master Tracking Sheet into the mirror.
 *
 * Snapshot semantics: a fresh run row, then every mirrored row against it. The
 * app reads the latest run, so a half-finished pull is never what anyone sees —
 * the run is written FIRST and its rows land under it, and a failure leaves the
 * previous run standing as the current truth.
 *
 * Never invents anything: a client with no sheet configured returns an error
 * for the caller to render honestly, and a tab this app does not know is
 * skipped rather than guessed at.
 */
export async function syncClientTrackingSheet(
  clientId: string,
): Promise<TrackingSyncResult> {
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id, sheet: clients.trackingSheetId, name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return empty("No such client.");
  if (!client.sheet) {
    return empty(
      `${client.name} has no tracking sheet linked yet — add its Sheet ID on the client's setup page.`,
    );
  }

  let titles: string[];
  try {
    titles = await readSheetTitles(client.sheet);
  } catch (e) {
    return empty(
      `Could not open the tracking sheet: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  // What this client's sheet has taught us, so a column nobody anticipated is
  // read correctly instead of being kept and ignored. Only APPROVED mappings
  // count: a model's proposal never moves a number on its own.
  const learned = await db
    .select({
      tab: clientColumnMap.tab,
      header: clientColumnMap.header,
      field: clientColumnMap.field,
    })
    .from(clientColumnMap)
    .where(
      and(
        eq(clientColumnMap.clientId, clientId),
        isNotNull(clientColumnMap.approvedAt),
      ),
    );
  const learnedByTab = new Map<string, LearnedAlias[]>();
  for (const row of learned) {
    const list = learnedByTab.get(row.tab) ?? [];
    list.push({ header: row.header, field: row.field as LearnedAlias["field"] });
    learnedByTab.set(row.tab, list);
  }

  const scans: TabScan[] = [];
  const parsed: TrackingRow[] = [];
  for (const title of titles) {
    const tab = tabFromTitle(title);
    if (!tab) continue;
    let values: string[][];
    try {
      values = await readSheetValues(client.sheet, `'${title}'!A1:AZ${MAX_ROWS}`);
    } catch {
      // One unreadable tab must not lose the other nine.
      continue;
    }
    const { rows, fields, unmapped } = parseTrackingTab(
      tab,
      values,
      learnedByTab.get(tab) ?? [],
    );
    scans.push(scanTab(tab, rows, fields, unmapped));
    parsed.push(...rows);
  }

  // The sheet is one adapter among several: it turns its own payload into
  // rows, and the shared spine handles the snapshot, the chunking and this
  // source's retention. Close, Calendly and Stripe will write the same way.
  const { syncId } = await writeSourceSnapshot({
    clientId,
    source: "sheet",
    connectionRef: client.sheet,
    rows: parsed,
    tabs: scans,
  });

  return { syncId, rowCount: parsed.length, tabs: scans, error: null };
}

function empty(error: string): TrackingSyncResult {
  return { syncId: null, rowCount: 0, tabs: [], error };
}
