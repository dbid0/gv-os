import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientTrackingRows, clientTrackingSyncs } from "@/db/schema/app";
import type { TrackingRow } from "@/lib/tracking/parse";
import { snapshotsToPrune } from "@/lib/tracking/retention";
import type { TabScan } from "@/lib/tracking/scan";
import type { FactSource } from "@/lib/tracking/sources";

/**
 * WRITING ONE SOURCE'S VIEW OF A CLIENT.
 *
 * Every system that knows something about an offer — the tracking sheet today,
 * Close, Calendly, Stripe and Whop when their keys land — writes through here.
 * One spine, one snapshot shape, one retention policy, so a new integration is
 * an ADAPTER rather than a second pipeline with its own idea of what a lead is.
 *
 * An adapter's whole job is to turn its system's payload into `TrackingRow`s.
 * It never decides precedence: which source wins a given fact is settled once,
 * at read time, by `lib/tracking/sources`. That separation is what stops a new
 * integration quietly becoming authoritative about something it should not own.
 */
export interface SourceIngest {
  clientId: string;
  source: FactSource;
  /** The sheet id, Close org id, Stripe account — whatever identifies the feed. */
  connectionRef: string;
  rows: TrackingRow[];
  tabs: TabScan[];
}

export interface IngestResult {
  syncId: string;
  rowCount: number;
}

/** Rows per insert. A single statement of thousands exceeds the parameter cap. */
const CHUNK = 500;

/**
 * Write one source's snapshot and prune that source's history.
 *
 * Snapshot semantics, per source: a fresh run row, then its rows beneath it.
 * A failed pull leaves the previous snapshot of THAT source standing, and
 * never touches another source's — a Close outage must not blank the sheet.
 */
export async function writeSourceSnapshot(input: SourceIngest): Promise<IngestResult> {
  const db = getDb();
  const [run] = await db
    .insert(clientTrackingSyncs)
    .values({
      clientId: input.clientId,
      source: input.source,
      spreadsheetId: input.connectionRef,
      status: "ok",
      rowCount: input.rows.length,
      tabs: input.tabs as unknown as Record<string, unknown>[],
    })
    .returning({ id: clientTrackingSyncs.id });

  for (let i = 0; i < input.rows.length; i += CHUNK) {
    const chunk = input.rows.slice(i, i + CHUNK);
    await db.insert(clientTrackingRows).values(
      chunk.map((r) => ({
        syncId: run.id,
        clientId: input.clientId,
        source: input.source,
        tab: r.tab,
        rowIndex: r.rowIndex,
        occurredAt: r.occurredAt,
        email: r.email,
        name: r.name,
        phone: r.phone,
        rep: r.rep,
        status: r.status,
        outcome: r.outcome,
        cashCents: r.cashCents,
        revenueCents: r.revenueCents,
        recordingUrl: r.recordingUrl,
        notes: r.notes,
        payload: r.payload,
      })),
    );
  }

  await pruneSource(input.clientId, input.source);
  return { syncId: run.id, rowCount: input.rows.length };
}

/**
 * Keep the last few snapshots OF THIS SOURCE.
 *
 * Per source, because the sheet syncing ten times today must not age out the
 * one Close pull that holds every call's real timestamp.
 */
async function pruneSource(clientId: string, source: FactSource): Promise<void> {
  try {
    const db = getDb();
    const snapshots = await db
      .select({ id: clientTrackingSyncs.id })
      .from(clientTrackingSyncs)
      .where(eq(clientTrackingSyncs.clientId, clientId))
      .orderBy(desc(clientTrackingSyncs.createdAt));
    // Only this source's history is a candidate for pruning.
    const mine = await db
      .select({ id: clientTrackingSyncs.id })
      .from(clientTrackingSyncs)
      .where(eq(clientTrackingSyncs.source, source))
      .orderBy(desc(clientTrackingSyncs.createdAt));
    const mineIds = new Set(mine.map((s) => s.id));
    const stale = snapshotsToPrune(snapshots.filter((s) => mineIds.has(s.id)));
    if (stale.length === 0) return;
    for (const id of stale) {
      await db.delete(clientTrackingSyncs).where(eq(clientTrackingSyncs.id, id));
    }
  } catch {
    // Housekeeping must never fail a pull that already succeeded.
  }
}
