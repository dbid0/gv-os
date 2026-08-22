import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  normalizeCalendlyEvent,
  normalizeGenericBooking,
  type NormalizedBooking,
} from "@/lib/bookings/normalize";
import { failureNote } from "@/lib/integrations/sync-note";

/**
 * Bookings capture: Calendly pulls + a per-connection webhook for schedulers
 * without a usable API (iClosed's REST endpoints were unreachable when
 * probed — the webhook path is the reliable lane for it).
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

/** Webhook capture for schedulers that push (iClosed and friends). */
export async function captureBookingWebhook(
  conn: { id: string; provider: string; clientId: string | null },
  payload: Payload,
): Promise<{ captured: boolean; reason: "new" | "duplicate" | "unparseable" }> {
  const normalized = normalizeGenericBooking(payload);
  if (!normalized) return { captured: false, reason: "unparseable" };
  const captured = await storeBooking(conn, normalized, payload);
  return { captured, reason: captured ? "new" : "duplicate" };
}
