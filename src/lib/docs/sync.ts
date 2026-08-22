import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { applications, integrations, signedDocs } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  isCompletedDoc,
  normalizePandaDoc,
  normalizeTypeformResponse,
} from "@/lib/docs/normalize";
import { failureNote } from "@/lib/integrations/sync-note";

/**
 * PandaDoc signed-docs poll + Typeform applications pull. Both follow the
 * house capture pattern: vault key per connection, idempotent on the source's
 * own id, raw kept, last-sync health on the card.
 */

type Payload = Record<string, unknown>;

const WINDOW_DAYS = 30;

async function connectionsFor(provider: string) {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();
  const rows = await db
    .select({
      id: integrations.id,
      clientId: integrations.clientId,
      secretBox: integrations.secretBox,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, provider),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );
  return { key, db, rows };
}

/** Poll recent PandaDoc documents; capture the completed ones. */
export async function pullPandaDocSigned(): Promise<
  { integrationId: string; fetched?: number; captured?: number; error?: string }[]
> {
  const { key, db, rows } = await connectionsFor("pandadoc");
  const results = [];
  for (const conn of rows) {
    try {
      const apiKey = open(conn.secretBox as string, key);
      const res = await fetch(
        "https://api.pandadoc.com/public/v1/documents?count=100&order_by=-date_modified",
        { headers: { Authorization: `API-Key ${apiKey}` } },
      );
      if (!res.ok) {
        throw new Error(`PandaDoc list failed (${res.status}): ${await res.text()}`);
      }
      const body = (await res.json()) as { results?: Payload[] };
      const docs = body.results ?? [];
      let captured = 0;
      for (const doc of docs) {
        const normalized = normalizePandaDoc(doc);
        if (!normalized || !isCompletedDoc(normalized)) continue;
        const inserted = await db
          .insert(signedDocs)
          .values({
            integrationId: conn.id,
            provider: "pandadoc",
            externalId: normalized.externalId,
            clientId: conn.clientId,
            name: normalized.name,
            docStatus: normalized.docStatus,
            recipientEmail: normalized.recipientEmail,
            completedAt: normalized.completedAt
              ? new Date(normalized.completedAt)
              : null,
            raw: doc,
          })
          .onConflictDoNothing({
            target: [signedDocs.provider, signedDocs.externalId],
          })
          .returning({ id: signedDocs.id });
        if (inserted.length > 0) captured += 1;
      }
      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `scanned ${docs.length} recent docs, captured ${captured} newly signed`,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, conn.id));
      results.push({ integrationId: conn.id, fetched: docs.length, captured });
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

/** Pull recent responses for every form in each Typeform connection. */
export async function pullTypeformApplications(): Promise<
  {
    integrationId: string;
    forms?: number;
    fetched?: number;
    captured?: number;
    error?: string;
  }[]
> {
  const { key, db, rows } = await connectionsFor("typeform");
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const results = [];
  for (const conn of rows) {
    try {
      const token = open(conn.secretBox as string, key);
      const headers = { Authorization: `Bearer ${token}` };
      const formsRes = await fetch("https://api.typeform.com/forms?page_size=20", {
        headers,
      });
      if (!formsRes.ok) {
        throw new Error(
          `Typeform forms list failed (${formsRes.status}): ${await formsRes.text()}`,
        );
      }
      const formsBody = (await formsRes.json()) as { items?: Payload[] };
      const forms = formsBody.items ?? [];
      let fetched = 0;
      let captured = 0;
      for (const form of forms) {
        const formId = typeof form.id === "string" ? form.id : null;
        if (!formId) continue;
        const respRes = await fetch(
          `https://api.typeform.com/forms/${formId}/responses?since=${encodeURIComponent(since)}&page_size=100&completed=true`,
          { headers },
        );
        if (!respRes.ok) continue; // fail-soft per form
        const respBody = (await respRes.json()) as { items?: Payload[] };
        const items = respBody.items ?? [];
        fetched += items.length;
        for (const item of items) {
          const normalized = normalizeTypeformResponse(item);
          if (!normalized) continue;
          const inserted = await db
            .insert(applications)
            .values({
              integrationId: conn.id,
              provider: "typeform",
              externalId: normalized.externalId,
              clientId: conn.clientId,
              formId,
              formName: typeof form.title === "string" ? form.title : null,
              email: normalized.email,
              name: normalized.name,
              submittedAt: normalized.submittedAt
                ? new Date(normalized.submittedAt)
                : null,
              raw: item,
            })
            .onConflictDoNothing({
              target: [applications.provider, applications.externalId],
            })
            .returning({ id: applications.id });
          if (inserted.length > 0) captured += 1;
        }
      }
      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `${forms.length} forms, ${fetched} responses (30d), captured ${captured} new`,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, conn.id));
      results.push({ integrationId: conn.id, forms: forms.length, fetched, captured });
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
