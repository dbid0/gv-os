import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { crmActivity, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import { emailFromCloseLead, normalizeCloseActivity } from "@/lib/crm/close-normalize";
import { failureNote } from "@/lib/integrations/sync-note";

/**
 * Close activity pull. For every connected `close` integration in the vault:
 * pull the last 7 days of calls, SMS, and emails (paginated, capped) and
 * capture them idempotently. Runs on the sync schedule; a re-run of the same
 * window is a no-op thanks to the (provider, external_id) unique key.
 */

const KINDS = ["call", "sms", "email"] as const;
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_KIND = 10;
// A month, not a week: speed-to-lead is judged over 30 days, so the dialler's
// record must cover the same window the applications do. Captures are
// idempotent on (provider, external_id) — re-pulling costs reads, never dupes.
const WINDOW_DAYS = 30;

export async function pullCloseActivity(): Promise<
  { integrationId: string; fetched?: number; captured?: number; error?: string }[]
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
    try {
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

      // Resolve lead emails for rows that still lack one — speed-to-lead
      // joins applications to first dials BY EMAIL, and activities carry only
      // the CRM's lead id. Capped per run; repeated runs converge.
      const resolvedLeads = await resolveLeadEmails(db, conn.id, auth);

      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `pulled ${fetched} activities (30d), captured ${captured} new, resolved ${resolvedLeads} lead emails`,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, conn.id));
      results.push({ integrationId: conn.id, fetched, captured });
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

/** How many leads to resolve per run — keeps a sync bounded on big backlogs. */
const LEAD_RESOLVE_CAP = 100;

/**
 * Fill `lead_email` on captured activities from Close's own lead records.
 * One fetch per DISTINCT unresolved lead, capped; every activity of that
 * lead is stamped in one update. A lead whose record has no email is left
 * null and retried next run (cheap: it stays inside the same cap).
 */
async function resolveLeadEmails(
  db: ReturnType<typeof getDb>,
  integrationId: string,
  auth: string,
): Promise<number> {
  const pending = await db
    .selectDistinct({ leadId: crmActivity.leadId })
    .from(crmActivity)
    .where(
      and(
        eq(crmActivity.integrationId, integrationId),
        isNotNull(crmActivity.leadId),
        isNull(crmActivity.leadEmail),
      ),
    )
    .limit(LEAD_RESOLVE_CAP);

  let resolved = 0;
  for (const row of pending) {
    const leadId = row.leadId as string;
    const res = await fetch(
      `https://api.close.com/api/v1/lead/${encodeURIComponent(leadId)}/?_fields=id,contacts`,
      { headers: { Authorization: auth } },
    );
    // A single bad lead must not fail the sync that already captured data.
    if (!res.ok) continue;
    const payload = (await res.json()) as Record<string, unknown>;
    const email = emailFromCloseLead(payload);
    if (!email) continue;
    await db
      .update(crmActivity)
      .set({ leadEmail: email })
      .where(
        and(
          eq(crmActivity.integrationId, integrationId),
          eq(crmActivity.leadId, leadId),
        ),
      );
    resolved += 1;
  }
  return resolved;
}
