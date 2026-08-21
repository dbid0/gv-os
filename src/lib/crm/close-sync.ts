import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { crmActivity, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import { normalizeCloseActivity } from "@/lib/crm/close-normalize";

/**
 * Close activity pull. For every connected `close` integration in the vault:
 * pull the last 7 days of calls, SMS, and emails (paginated, capped) and
 * capture them idempotently. Runs on the sync schedule; a re-run of the same
 * window is a no-op thanks to the (provider, external_id) unique key.
 */

const KINDS = ["call", "sms", "email"] as const;
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_KIND = 5;
const WINDOW_DAYS = 7;

export async function pullCloseActivity(): Promise<
  { integrationId: string; fetched: number; captured: number }[]
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
        eq(integrations.provider, "close"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = [];

  for (const conn of connections) {
    const apiKey = open(conn.secretBox as string, key);
    const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
    let fetched = 0;
    let captured = 0;

    for (const kind of KINDS) {
      let skip = 0;
      for (let page = 0; page < MAX_PAGES_PER_KIND; page += 1) {
        const url =
          `https://api.close.com/api/v1/activity/${kind}/` +
          `?date_created__gt=${encodeURIComponent(since)}&_limit=${PAGE_LIMIT}&_skip=${skip}`;
        const res = await fetch(url, { headers: { Authorization: auth } });
        if (!res.ok) {
          throw new Error(
            `Close ${kind} pull failed (${res.status}): ${await res.text()}`,
          );
        }
        const body = (await res.json()) as {
          data?: Record<string, unknown>[];
          has_more?: boolean;
        };
        const rows = body.data ?? [];
        fetched += rows.length;
        for (const row of rows) {
          const normalized = normalizeCloseActivity(kind, row);
          if (!normalized) continue;
          const inserted = await db
            .insert(crmActivity)
            .values({
              integrationId: conn.id,
              provider: "close",
              externalId: normalized.externalId,
              clientId: conn.clientId,
              kind: normalized.kind,
              userId: normalized.userId,
              userName: normalized.userName,
              direction: normalized.direction,
              durationSeconds: normalized.durationSeconds,
              occurredAt: normalized.occurredAt
                ? new Date(normalized.occurredAt)
                : null,
              leadId: normalized.leadId,
              raw: row,
            })
            .onConflictDoNothing({
              target: [crmActivity.provider, crmActivity.externalId],
            })
            .returning({ id: crmActivity.id });
          if (inserted.length > 0) captured += 1;
        }
        if (!body.has_more) break;
        skip += PAGE_LIMIT;
      }
    }

    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncNote: `pulled ${fetched} activities (7d), captured ${captured} new`,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, conn.id));
    results.push({ integrationId: conn.id, fetched, captured });
  }
  return results;
}
