import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { callRecordings, clientTrackingRows } from "@/db/schema/app";
import {
  copyTranscriptUrlFrom,
  parseShareToken,
  parseTranscriptPayload,
} from "@/lib/calls/fathom-share";

/**
 * Pull the transcript behind every end-of-call report's recording link.
 *
 * The closer already did the hard part: they filed the EOC report and pasted
 * the Fathom share link. This follows that link — share page, then the
 * copy-transcript endpoint the page itself advertises — and stores the
 * transcript against the offer, so a manager reads the call in GV OS instead
 * of opening 25 tabs.
 *
 * Stored under provider `fathom_share` with the share token as the external id,
 * which is unique per (provider, external_id): re-running is a no-op for calls
 * already pulled, so this is safe to run after every sheet sync.
 *
 * The AI READ is a separate step and stays unwired until the model provider is
 * connected. Having the transcript is what unblocks it; the analysis columns
 * remain `pending` rather than being filled with a guess.
 */

const PROVIDER = "fathom_share";
/** Politeness + protection: one call at a time, and never a runaway backlog. */
const MAX_PER_RUN = 40;
const TIMEOUT_MS = 30_000;

export interface TranscriptPullResult {
  considered: number;
  alreadyHad: number;
  fetched: number;
  failed: number;
  errors: string[];
}

export async function pullShareTranscripts(
  clientId: string,
  syncId: string,
): Promise<TranscriptPullResult> {
  const db = getDb();

  const rows = await db
    .select({
      recordingUrl: clientTrackingRows.recordingUrl,
      occurredAt: clientTrackingRows.occurredAt,
      email: clientTrackingRows.email,
      rep: clientTrackingRows.rep,
      status: clientTrackingRows.status,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        eq(clientTrackingRows.tab, "eoc"),
        isNotNull(clientTrackingRows.recordingUrl),
      ),
    );

  // One entry per share token: the same call can appear on two EOC rows.
  const wanted = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const token = parseShareToken(row.recordingUrl);
    if (token && !wanted.has(token)) wanted.set(token, row);
  }

  const result: TranscriptPullResult = {
    considered: wanted.size,
    alreadyHad: 0,
    fetched: 0,
    failed: 0,
    errors: [],
  };
  if (wanted.size === 0) return result;

  const existing = await db
    .select({ externalId: callRecordings.externalId })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.provider, PROVIDER),
        inArray(callRecordings.externalId, [...wanted.keys()]),
      ),
    );
  const have = new Set(existing.map((e) => e.externalId));
  result.alreadyHad = have.size;

  const todo = [...wanted.entries()].filter(([token]) => !have.has(token));
  for (const [token, row] of todo.slice(0, MAX_PER_RUN)) {
    try {
      const transcript = await fetchShareTranscript(row.recordingUrl!);
      if (!transcript) {
        result.failed += 1;
        result.errors.push(`${token}: no transcript on the share page`);
        continue;
      }
      await db.insert(callRecordings).values({
        provider: PROVIDER,
        externalId: token,
        clientId,
        title: transcript.title,
        recordingUrl: row.recordingUrl,
        transcript: transcript.text,
        durationSeconds: transcript.durationSeconds,
        occurredAt: row.occurredAt,
        participants: [row.rep, row.email].filter((v): v is string => Boolean(v)),
        // The read is a separate step and needs a model; nothing is guessed here.
        analysisStatus: "pending",
      });
      result.fetched += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push(`${token}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return result;
}

/** Share URL → transcript, following the page's own copy-transcript endpoint. */
async function fetchShareTranscript(shareUrl: string) {
  const page = await get(shareUrl);
  const copyUrl = copyTranscriptUrlFrom(page);
  // No endpoint on the page means Fathom changed it — fail visibly rather than
  // constructing a URL from a guessed call id.
  if (!copyUrl) return null;
  const raw = await get(copyUrl, "application/json");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseTranscriptPayload(payload);
}

async function get(url: string, accept = "text/html"): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: accept },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Transcripts held for one offer, newest first. */
export async function transcriptsForClient(clientId: string) {
  const db = getDb();
  return db
    .select({
      id: callRecordings.id,
      title: callRecordings.title,
      recordingUrl: callRecordings.recordingUrl,
      occurredAt: callRecordings.occurredAt,
      durationSeconds: callRecordings.durationSeconds,
      participants: callRecordings.participants,
      analysisStatus: callRecordings.analysisStatus,
      analysisOutcome: callRecordings.analysisOutcome,
    })
    .from(callRecordings)
    .where(
      and(eq(callRecordings.clientId, clientId), eq(callRecordings.provider, PROVIDER)),
    );
}

/** One stored transcript by its share URL, for the lead timeline. */
export async function transcriptByShareUrl(url: string) {
  const token = parseShareToken(url);
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: callRecordings.id,
      title: callRecordings.title,
      transcript: callRecordings.transcript,
      durationSeconds: callRecordings.durationSeconds,
      analysisStatus: callRecordings.analysisStatus,
      analysisOutcome: callRecordings.analysisOutcome,
    })
    .from(callRecordings)
    .where(
      and(eq(callRecordings.provider, PROVIDER), eq(callRecordings.externalId, token)),
    )
    .limit(1);
  return row ?? null;
}
