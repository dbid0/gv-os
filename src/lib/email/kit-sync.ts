import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { integrations, kitBroadcasts, kitSnapshots } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  parseKitAccount,
  parseKitSequences,
  parseKitSubscriberTotal,
  parseKitTagCount,
} from "@/lib/email/kit-parse";
import { failureNote } from "@/lib/integrations/sync-note";
import { timeoutFetch } from "@/lib/net/timeout-fetch";

/**
 * Kit account snapshot pull — one snapshot per connected `kit` integration
 * per run. Three GETs per account (account, sequences, tags), well under
 * Kit's write-side rate limits since everything here is a read.
 */

async function kitGet(apiKey: string, path: string): Promise<unknown> {
  const res = await timeoutFetch(`https://api.kit.com/v4${path}`, {
    headers: { "X-Kit-Api-Key": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Kit ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function pullKitSnapshots(): Promise<
  {
    integrationId: string;
    sequences?: number;
    tags?: number;
    subscribers?: number | null;
    error?: string;
  }[]
> {
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
        eq(integrations.provider, "kit"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const results = [];
  for (const conn of connections) {
    try {
      const apiKey = open(conn.secretBox as string, key);
      const [account, sequencesBody, tagsBody, subscribersBody] = await Promise.all([
        kitGet(apiKey, "/account"),
        kitGet(apiKey, "/sequences?per_page=500"),
        kitGet(apiKey, "/tags?per_page=500"),
        kitGet(apiKey, "/subscribers?per_page=1&include_total_count=true"),
      ]);
      const parsedAccount = parseKitAccount(account);
      const sequences = parseKitSequences(sequencesBody);
      const tagCount = parseKitTagCount(tagsBody);
      const subscriberCount = parseKitSubscriberTotal(subscribersBody);

      await db.insert(kitSnapshots).values({
        integrationId: conn.id,
        clientId: conn.clientId,
        accountName: parsedAccount.name,
        plan: parsedAccount.plan,
        sequenceCount: sequences.length,
        tagCount,
        subscriberCount,
        sequences,
      });
      const broadcastCount = await pullBroadcasts(db, conn, apiKey);
      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `${subscriberCount === null ? "" : `${subscriberCount} subscribers, `}${sequences.length} sequences, ${broadcastCount} broadcasts, ${tagCount} tags${parsedAccount.plan ? ` (${parsedAccount.plan})` : ""}`,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, conn.id));
      results.push({
        integrationId: conn.id,
        sequences: sequences.length,
        tags: tagCount,
        subscribers: subscriberCount,
      });
    } catch (err) {
      // One dead credential must not starve the other accounts or fail the
      // route. lastSyncAt stays untouched — it always means last SUCCESS.
      const note = failureNote(err);
      await db
        .update(integrations)
        .set({ lastSyncNote: note, updatedAt: new Date() })
        .where(eq(integrations.id, conn.id));
      results.push({ integrationId: conn.id, error: note });
    }
  }
  return results;
}

type BroadcastRow = {
  externalId: string;
  subject: string | null;
  previewText: string | null;
  sentAt: Date | null;
  status: string | null;
  recipients: number | null;
  emailsOpened: number | null;
  openRateBps: number | null;
  totalClicks: number | null;
  clickRateBps: number | null;
  unsubscribes: number | null;
  openTrackingDisabled: boolean;
};

const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const pctToBps = (v: unknown): number | null => {
  const n = asNum(v);
  return n === null ? null : Math.round(n * 100);
};

/**
 * The account's recent broadcasts with their stats — the per-email numbers
 * the Email page shows. Stats keep changing after send (opens trickle in),
 * so rows UPSERT on Kit's own broadcast id. Stats fetch runs four at a time:
 * enough to finish 30 emails quickly, gentle on the rate limit.
 */
async function pullBroadcasts(
  db: ReturnType<typeof getDb>,
  conn: { id: string; clientId: string | null },
  apiKey: string,
): Promise<number> {
  const listBody = (await kitGet(apiKey, "/broadcasts?per_page=30")) as {
    broadcasts?: Record<string, unknown>[];
  };
  const list = (listBody.broadcasts ?? []).filter(
    (b) => typeof b.id === "number" || typeof b.id === "string",
  );

  const rows: BroadcastRow[] = [];
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const id = String(b.id);
        let stats: Record<string, unknown> = {};
        try {
          const statsBody = (await kitGet(apiKey, `/broadcasts/${id}/stats`)) as {
            broadcast?: { stats?: Record<string, unknown> };
          };
          stats = statsBody.broadcast?.stats ?? {};
        } catch {
          // A broadcast whose stats endpoint fails still lists — with nulls,
          // which render as dashes, never zeros.
        }
        const sent = typeof b.send_at === "string" ? new Date(b.send_at) : null;
        rows.push({
          externalId: id,
          subject: typeof b.subject === "string" ? b.subject : null,
          previewText: typeof b.preview_text === "string" ? b.preview_text : null,
          sentAt: sent && !Number.isNaN(sent.getTime()) ? sent : null,
          status: typeof b.status === "string" ? b.status : null,
          recipients: asNum(stats.recipients),
          emailsOpened: asNum(stats.emails_opened),
          openRateBps: pctToBps(stats.open_rate),
          totalClicks: asNum(stats.total_clicks),
          clickRateBps: pctToBps(stats.click_rate),
          unsubscribes: asNum(stats.unsubscribes),
          openTrackingDisabled: stats.open_tracking_disabled === true,
        });
      }
    }),
  );

  for (const row of rows) {
    await db
      .insert(kitBroadcasts)
      .values({ integrationId: conn.id, clientId: conn.clientId, ...row })
      .onConflictDoUpdate({
        target: [kitBroadcasts.integrationId, kitBroadcasts.externalId],
        set: { ...row, syncedAt: new Date() },
      });
  }
  return rows.length;
}
