import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  callRecordings,
  clients,
  clientTrackingRows,
  clientTrackingSyncs,
} from "@/db/schema/app";
import type { CallAnalysis } from "@/lib/calls/call-analysis";
import {
  decideReview,
  orderReviews,
  readCallResult,
  type ReviewCandidate,
} from "@/lib/calls/review";

/**
 * The call-review queue.
 *
 * A read on its own doesn't say whether a manager should look — the closer's
 * own end-of-call status does. So this joins each stored recording back to the
 * EOC row whose recording link produced it, in the CURRENT tracking snapshot,
 * and lets the pure `decideReview` rule judge the pair.
 *
 * Joining on the recording URL rather than on time or rep name is deliberate:
 * it is the exact string the closer pasted, so a call can never be filed
 * against the wrong report.
 */
export async function reviewQueue(
  options: {
    clientId?: string;
    includeReviewed?: boolean;
    limit?: number;
  } = {},
): Promise<ReviewCandidate[]> {
  const db = getDb();
  const { clientId, includeReviewed = false, limit = 100 } = options;

  const where = [
    eq(callRecordings.analysisStatus, "done"),
    isNotNull(callRecordings.analysisOutcome),
  ];
  if (clientId) where.push(eq(callRecordings.clientId, clientId));
  if (!includeReviewed) where.push(isNull(callRecordings.reviewedAt));

  const recordings = await db
    .select({
      id: callRecordings.id,
      clientId: callRecordings.clientId,
      title: callRecordings.title,
      recordingUrl: callRecordings.recordingUrl,
      occurredAt: callRecordings.occurredAt,
      participants: callRecordings.participants,
      analysis: callRecordings.analysis,
      reviewedAt: callRecordings.reviewedAt,
    })
    .from(callRecordings)
    .where(and(...where))
    .orderBy(desc(callRecordings.occurredAt))
    .limit(limit);

  if (recordings.length === 0) return [];

  // The closer's own status for each call, from the current snapshot.
  const statusByUrl = await eocStatusByRecordingUrl();
  const slugs = await slugById();

  const candidates: ReviewCandidate[] = [];
  for (const rec of recordings) {
    const analysis = rec.analysis as unknown as CallAnalysis;
    const result = readCallResult(
      rec.recordingUrl ? (statusByUrl.get(rec.recordingUrl) ?? null) : null,
    );
    const decision = decideReview({
      result,
      analysis: {
        objections: analysis?.objections ?? [],
        missedSteps: analysis?.missedSteps ?? [],
        coaching: analysis?.coaching ?? [],
      },
    });
    if (!decision.needed) continue;
    candidates.push({
      recordingId: rec.id,
      clientId: rec.clientId,
      clientSlug: rec.clientId ? (slugs.get(rec.clientId) ?? null) : null,
      title: rec.title,
      rep: rec.participants?.[0] ?? null,
      leadEmail: rec.participants?.[1] ?? null,
      occurredAt: rec.occurredAt,
      result,
      decision,
    });
  }
  return orderReviews(candidates);
}

/**
 * Recording URL → the closer's status, from each client's CURRENT snapshot.
 *
 * Scoped to the current snapshots rather than scanning every historical one.
 * A sync writes a fresh copy of the whole sheet, so "all snapshots" grows by
 * hundreds of rows every run: after four syncs this was reading 118 EOC rows
 * to use 25, and it never stopped growing. The old rows could only ever be
 * shadowed by newer ones anyway, so reading them was pure waste.
 */
async function eocStatusByRecordingUrl(): Promise<Map<string, string>> {
  const db = getDb();
  const current = await currentSyncIds();
  if (current.length === 0) return new Map();

  const rows = await db
    .select({
      recordingUrl: clientTrackingRows.recordingUrl,
      status: clientTrackingRows.status,
    })
    .from(clientTrackingRows)
    .where(
      and(
        inArray(clientTrackingRows.syncId, current),
        eq(clientTrackingRows.tab, "eoc"),
        isNotNull(clientTrackingRows.recordingUrl),
        isNotNull(clientTrackingRows.status),
      ),
    );

  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.recordingUrl && r.status && !out.has(r.recordingUrl)) {
      out.set(r.recordingUrl, r.status);
    }
  }
  return out;
}

/** The newest snapshot id for each client — what every read should use. */
async function currentSyncIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: clientTrackingSyncs.id, clientId: clientTrackingSyncs.clientId })
    .from(clientTrackingSyncs)
    .orderBy(desc(clientTrackingSyncs.createdAt));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) {
    if (seen.has(r.clientId)) continue;
    seen.add(r.clientId);
    ids.push(r.id);
  }
  return ids;
}

async function slugById(): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db.select({ id: clients.id, slug: clients.slug }).from(clients);
  return new Map(rows.map((r) => [r.id, r.slug]));
}

/** How many calls are waiting on the manager. */
export async function reviewQueueCount(clientId?: string): Promise<number> {
  return (await reviewQueue({ clientId })).length;
}
