import "server-only";

import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityLogs, callRecordings, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  MATCH_WINDOW_MS,
  matchRecordingToCall,
  normalizeFathomRecording,
  type CallCandidate,
} from "@/lib/calls/fathom-normalize";

/**
 * Fathom recording pull.
 *
 * For every connected `fathom` integration: fetch recent recordings, store them
 * with their transcripts, and attach each to the logged call it belongs to so a
 * manager opening a call already has the recording and the transcript on it.
 *
 * Idempotent — (provider, external_id) is unique, so re-running the same window
 * updates in place instead of duplicating. Matching is done by the pure
 * `matchRecordingToCall`, which returns nothing rather than guess: an
 * unattached recording is fine, a MIS-attached one puts one prospect's
 * transcript on another prospect's record.
 */

const WINDOW_DAYS = 7;
const PAGE_LIMIT = 50;
const MAX_PAGES = 4;

export interface FathomPullResult {
  integrationId: string;
  fetched?: number;
  stored?: number;
  linked?: number;
  error?: string;
}

/** Fathom's list endpoint. Kept here so the shape is easy to adjust. */
function listUrl(since: string, cursor: string | null): string {
  const params = new URLSearchParams({
    created_since: since,
    limit: String(PAGE_LIMIT),
  });
  if (cursor) params.set("cursor", cursor);
  return `https://api.fathom.video/external/v1/meetings?${params.toString()}`;
}

export async function pullFathomRecordings(): Promise<FathomPullResult[]> {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();

  const connections = await db
    .select({
      id: integrations.id,
      clientId: integrations.clientId,
      secretBox: integrations.secretBox,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "fathom"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  // Nothing connected is a normal state, not an error — the surfaces show an
  // honest "not connected yet" rather than a failure.
  if (connections.length === 0) return [];

  const sinceMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();
  const results: FathomPullResult[] = [];

  for (const conn of connections) {
    try {
      const apiKey = open(conn.secretBox as string, key);
      let fetched = 0;
      let stored = 0;
      let linked = 0;
      let cursor: string | null = null;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const res = await fetch(listUrl(since, cursor), {
          headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Fathom pull failed (${res.status}): ${await res.text()}`);
        }
        const body = (await res.json()) as {
          items?: unknown[];
          data?: unknown[];
          next_cursor?: string | null;
        };
        const items = body.items ?? body.data ?? [];
        fetched += items.length;

        for (const raw of items) {
          const rec = normalizeFathomRecording(raw);
          if (!rec) continue;

          // Candidate calls: this connection's scope, inside the match window.
          const from = rec.occurredAt
            ? new Date(rec.occurredAt.getTime() - MATCH_WINDOW_MS)
            : null;
          const to = rec.occurredAt
            ? new Date(rec.occurredAt.getTime() + MATCH_WINDOW_MS)
            : null;

          let match: CallCandidate | null = null;
          if (from && to) {
            const scope = conn.clientId
              ? eq(activityLogs.clientId, conn.clientId)
              : undefined;
            const rows = await db
              .select({
                id: activityLogs.id,
                customerName: activityLogs.customerName,
                customerEmail: activityLogs.customerEmail,
                occurredAt: activityLogs.occurredAt,
                clientId: activityLogs.clientId,
              })
              .from(activityLogs)
              .where(
                scope
                  ? and(
                      scope,
                      gte(activityLogs.occurredAt, from),
                      lte(activityLogs.occurredAt, to),
                    )
                  : and(
                      gte(activityLogs.occurredAt, from),
                      lte(activityLogs.occurredAt, to),
                    ),
              )
              .limit(50);
            match = matchRecordingToCall(rec, rows);
            if (match) linked += 1;
          }

          await db
            .insert(callRecordings)
            .values({
              provider: "fathom",
              externalId: rec.externalId,
              clientId: conn.clientId ?? null,
              activityLogId: match?.id ?? null,
              title: rec.title,
              recordingUrl: rec.recordingUrl,
              transcript: rec.transcript,
              summary: rec.summary,
              durationSeconds: rec.durationSeconds,
              occurredAt: rec.occurredAt,
              participants: rec.participants,
              raw: (raw ?? {}) as Record<string, unknown>,
            })
            .onConflictDoUpdate({
              target: [callRecordings.provider, callRecordings.externalId],
              set: {
                title: rec.title,
                recordingUrl: rec.recordingUrl,
                transcript: rec.transcript,
                summary: rec.summary,
                durationSeconds: rec.durationSeconds,
                occurredAt: rec.occurredAt,
                participants: rec.participants,
                updatedAt: new Date(),
              },
            });
          stored += 1;

          // Put the recording link on the call itself, so the call-log row
          // carries it without a join.
          if (match && rec.recordingUrl) {
            await db
              .update(activityLogs)
              .set({ recordingUrl: rec.recordingUrl, updatedAt: new Date() })
              .where(
                and(eq(activityLogs.id, match.id), isNull(activityLogs.recordingUrl)),
              );
          }
        }

        cursor = body.next_cursor ?? null;
        if (!cursor || items.length === 0) break;
      }

      results.push({ integrationId: conn.id, fetched, stored, linked });
    } catch (e) {
      results.push({
        integrationId: conn.id,
        error: e instanceof Error ? e.message : "Fathom pull failed.",
      });
    }
  }

  return results;
}
