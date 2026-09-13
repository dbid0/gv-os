import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  normalizeCalendlyEvent,
  normalizeGenericBooking,
  normalizeIclosedEventCall,
  type NormalizedBooking,
} from "@/lib/bookings/normalize";
import { failureNote } from "@/lib/integrations/sync-note";

/**
 * Bookings capture: Calendly + iClosed pulls, plus a per-connection webhook
 * for any other scheduler that can only push. iClosed's REST API
 * (`public.api.iclosed.io`) is live and pulled directly — see
 * pullIclosedBookings — the webhook lane stays wired for schedulers with no
 * usable API.
 *
 * ⚠️ Calendly sits behind Cloudflare and 403s non-browser user agents
 * ("error code: 1010") — every request sends a browser UA. Hard-won lesson,
 * see INTEGRATIONS-API-PLAYBOOK.md.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const WINDOW_DAYS = 30;

async function calendlyGet(token: string, url: string): Promise<Payload> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": BROWSER_UA },
  });
  if (!res.ok) {
    throw new Error(
      `Calendly ${url.slice(0, 60)} failed (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as Payload;
}

const ICLOSED_BASE = "https://public.api.iclosed.io";
/** Last N days back, plus every upcoming call — see pullIclosedBookings. */
const ICLOSED_WINDOW_DAYS = 60;
/** Server-enforced max; asking for more 400s. */
const ICLOSED_PAGE_LIMIT = 100;
/**
 * Hard stop on how many pages a single pull will walk. eventCalls has no
 * server-side date filter, so every page must be fetched to reach the
 * newest/upcoming rows (see pullIclosedBookings); this bounds that walk so a
 * connection with years of history can't make one pull run forever. 20 pages
 * = 2,000 calls, comfortably beyond any single client's volume today.
 */
const ICLOSED_MAX_PAGES = 20;

async function iclosedGet(token: string, path: string): Promise<Payload> {
  const res = await fetch(`${ICLOSED_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `iClosed ${path.slice(0, 60)} failed (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as Payload;
}

type Payload = Record<string, unknown>;

async function storeBooking(
  conn: { id: string; provider: string; clientId: string | null },
  normalized: NormalizedBooking,
  raw: Payload,
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(bookings)
    .values({
      integrationId: conn.id,
      provider: conn.provider,
      externalId: normalized.externalId,
      clientId: conn.clientId,
      eventType: normalized.eventType,
      inviteeName: normalized.inviteeName,
      inviteeEmail: normalized.inviteeEmail,
      status: normalized.status,
      startsAt: normalized.startsAt ? new Date(normalized.startsAt) : null,
      bookedAt: normalized.bookedAt ? new Date(normalized.bookedAt) : null,
      raw,
    })
    .onConflictDoNothing({ target: [bookings.provider, bookings.externalId] })
    .returning({ id: bookings.id });
  return inserted.length > 0;
}

/** Pull the last 30 days of scheduled events for every Calendly connection. */
export async function pullCalendlyBookings(): Promise<
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
        eq(integrations.provider, "calendly"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const minStart = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const results = [];

  for (const conn of connections) {
    try {
      const token = open(conn.secretBox as string, key);
      const me = await calendlyGet(token, "https://api.calendly.com/users/me");
      const orgUri = (me.resource as Payload | undefined)?.current_organization;
      if (typeof orgUri !== "string") {
        throw new Error("Calendly /users/me returned no organization URI.");
      }
      let fetched = 0;
      let captured = 0;
      let url =
        `https://api.calendly.com/scheduled_events?organization=${encodeURIComponent(orgUri)}` +
        `&min_start_time=${encodeURIComponent(minStart)}&count=100`;
      for (let page = 0; page < 5 && url; page += 1) {
        const body = await calendlyGet(token, url);
        const events = Array.isArray(body.collection)
          ? (body.collection as Payload[])
          : [];
        fetched += events.length;
        for (const event of events) {
          const normalized = normalizeCalendlyEvent(event);
          if (!normalized) continue;
          if (
            await storeBooking(
              { id: conn.id, provider: "calendly", clientId: conn.clientId },
              normalized,
              event,
            )
          ) {
            captured += 1;
          }
        }
        const pagination = body.pagination as Payload | undefined;
        url = typeof pagination?.next_page === "string" ? pagination.next_page : "";
      }
      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `pulled ${fetched} events (30d), captured ${captured} new`,
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

/**
 * Pull iClosed event calls (bookings) for every connected iClosed connection.
 *
 * `/v1/eventCalls` takes `eventType` (PAST|UPCOMING|ALL), `limit` (max 100),
 * and a 0-indexed `page` — its `offset` query param is accepted but silently
 * ignored (confirmed against the live API; not documented). `eventType=ALL`
 * comes back sorted oldest → newest, so every page has to be walked to reach
 * the newest and upcoming rows; ICLOSED_MAX_PAGES bounds that walk. There is
 * no server-side date filter, so the last-60-days-through-all-upcoming window
 * is applied client-side after fetching.
 */
export async function pullIclosedBookings(): Promise<
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
        eq(integrations.provider, "iclosed"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const cutoff = Date.now() - ICLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const results = [];

  for (const conn of connections) {
    try {
      const token = open(conn.secretBox as string, key);
      let fetched = 0;
      let captured = 0;
      for (let page = 0; page < ICLOSED_MAX_PAGES; page += 1) {
        const body = await iclosedGet(
          token,
          `/v1/eventCalls?eventType=ALL&limit=${ICLOSED_PAGE_LIMIT}&page=${page}`,
        );
        const data =
          typeof body.data === "object" && body.data !== null
            ? (body.data as Payload)
            : {};
        const calls = Array.isArray(data.eventCalls)
          ? (data.eventCalls as Payload[])
          : [];
        fetched += calls.length;
        for (const call of calls) {
          const normalized = normalizeIclosedEventCall(call);
          if (!normalized) continue;
          const startsAtMs = normalized.startsAt
            ? Date.parse(normalized.startsAt)
            : NaN;
          if (!Number.isNaN(startsAtMs) && startsAtMs < cutoff) continue;
          if (
            await storeBooking(
              { id: conn.id, provider: "iclosed", clientId: conn.clientId },
              normalized,
              call,
            )
          ) {
            captured += 1;
          }
        }
        if (calls.length < ICLOSED_PAGE_LIMIT) break; // last page
      }
      await db
        .update(integrations)
        .set({
          lastSyncAt: new Date(),
          lastSyncNote: `pulled ${fetched} calls (60d+upcoming), captured ${captured} new`,
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

/** Webhook capture for schedulers that can't be pulled from directly. */
export async function captureBookingWebhook(
  conn: { id: string; provider: string; clientId: string | null },
  payload: Payload,
): Promise<{ captured: boolean; reason: "new" | "duplicate" | "unparseable" }> {
  const normalized = normalizeGenericBooking(payload);
  if (!normalized) return { captured: false, reason: "unparseable" };
  const captured = await storeBooking(conn, normalized, payload);
  return { captured, reason: captured ? "new" : "duplicate" };
}
