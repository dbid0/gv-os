import "server-only";

import { and, eq, gte, isNotNull, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, clientTrackingRows, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import { phoneKey } from "@/lib/crm/close-normalize";
import { currentSnapshot } from "@/lib/tracking/queries";

/**
 * APPLICATIONS BECOME LEADS — the handoff that never existed.
 *
 * Live data proved it: recent applicants, emails and phones intact, were
 * NEVER dialled — because nothing ever put them in the CRM. The floor dials
 * what's in Close; applications lived on the sheet. This closes that gap
 * natively (no Zapier to break): after a sheet sync, every recent applicant
 * is searched for in Close by email then phone, and created only when
 * genuinely absent.
 *
 * Rules:
 *  - SEARCH BEFORE CREATE, every run — the CRM's own record is the dedupe,
 *    so re-runs are idempotent and a lead the floor already made is never
 *    duplicated.
 *  - Recent applicants only (the window), capped per run — the point is
 *    dialling fresh applications, not flooding a client's CRM with history.
 *  - The lead's description says where it came from, so a setter knows.
 */

const CREATE_CAP_PER_RUN = 25;

export interface ClosePushResult {
  applicants: number;
  alreadyInCrm: number;
  created: number;
  /** Creates the CRM refused this run — surfaced, not swallowed. */
  createFailed: number;
  /** Set when nothing could run — never a fabricated zero. */
  error: string | null;
}

function empty(error: string): ClosePushResult {
  return { applicants: 0, alreadyInCrm: 0, created: 0, createFailed: 0, error };
}

async function closeKeyFor(clientId: string): Promise<string | null> {
  const credentialsKey = serverEnv().CREDENTIALS_KEY;
  if (!credentialsKey) return null;
  const db = getDb();
  const [conn] = await db
    .select({ secretBox: integrations.secretBox })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "close"),
        eq(integrations.clientId, clientId),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    )
    .limit(1);
  if (!conn?.secretBox) return null;
  return open(conn.secretBox as string, credentialsKey);
}

async function leadExists(
  auth: string,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  const queries: string[] = [];
  if (email) queries.push(`email:"${email}"`);
  if (phone) queries.push(`phone:"${phone}"`);
  for (const q of queries) {
    const res = await fetch(
      `https://api.close.com/api/v1/lead/?query=${encodeURIComponent(q)}&_fields=id&_limit=1`,
      { headers: { Authorization: auth } },
    );
    // On a search failure, claim existence — creating a possible duplicate
    // into a client's CRM is worse than missing one push (the next run
    // retries the search).
    if (!res.ok) return true;
    const body = (await res.json()) as { data?: unknown[] };
    if ((body.data ?? []).length > 0) return true;
  }
  return false;
}

export async function pushApplicantsToClose(
  clientId: string,
  since: Date,
): Promise<ClosePushResult> {
  const key = await closeKeyFor(clientId);
  if (!key) return empty("Close isn't connected for this offer.");
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  const snapshot = await currentSnapshot(clientId);
  if (!snapshot) return empty("No sheet snapshot to read applicants from.");

  const db = getDb();
  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const rows = await db
    .select({
      email: clientTrackingRows.email,
      phone: clientTrackingRows.phone,
      name: clientTrackingRows.name,
      occurredAt: clientTrackingRows.occurredAt,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, snapshot.syncId),
        eq(clientTrackingRows.tab, "applications"),
        gte(clientTrackingRows.occurredAt, since),
        or(isNotNull(clientTrackingRows.email), isNotNull(clientTrackingRows.phone)),
      ),
    )
    .limit(500);

  // One applicant per identity — the sheet repeats people across rows.
  const seen = new Set<string>();
  const applicants = rows.filter((r) => {
    const id = r.email ?? phoneKey(r.phone) ?? "";
    if (id === "" || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  let alreadyInCrm = 0;
  let created = 0;
  let createFailed = 0;
  for (const a of applicants) {
    if (created >= CREATE_CAP_PER_RUN) break;
    const phone = phoneKey(a.phone);
    if (await leadExists(auth, a.email, phone)) {
      alreadyInCrm += 1;
      continue;
    }
    const contact: Record<string, unknown> = { name: a.name ?? a.email ?? "" };
    if (a.email) contact.emails = [{ email: a.email, type: "office" }];
    if (a.phone) contact.phones = [{ phone: a.phone, type: "mobile" }];
    const res = await fetch("https://api.close.com/api/v1/lead/", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: a.name ?? a.email ?? "Applicant",
        description: `GV OS — application ${a.occurredAt?.toISOString().slice(0, 10) ?? ""} (${client?.name ?? "offer"})`,
        contacts: [contact],
      }),
    });
    if (res.ok) created += 1;
    else createFailed += 1;
    // A failed create is left for the next run — the search will still miss
    // it, and the retry costs one request. The count surfaces so a payload
    // problem can't hide behind silence.
  }

  return {
    applicants: applicants.length,
    alreadyInCrm,
    created,
    createFailed,
    error: null,
  };
}
