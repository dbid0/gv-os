import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { calendarFeedEvents, integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import { parseIcs } from "@/lib/calendar/ics";
import { failureNote } from "@/lib/integrations/sync-note";
import { BUSINESS_TIME_ZONE, dayKeyIn } from "@/lib/time/zone";
import { timeoutFetch } from "@/lib/net/timeout-fetch";

/**
 * Pull every connected calendar feed into the mirror.
 *
 * The credential is a Google Calendar's private "secret address in iCal
 * format", sealed in the same vault as every other connection. Google's
 * Calendar API is OAuth-only, which would mean a Cloud project, a consent
 * screen and refresh-token rotation for a read-only list of meetings; the iCal
 * address is one string a person pastes and can revoke from Google's own
 * settings, which is what "connected through Integrations, entered manually"
 * means in practice.
 *
 * REPLACE, DON'T MERGE. Each pull deletes that integration's rows and writes
 * what the feed now says. The feed is the truth: a meeting cancelled in Google
 * has to vanish here, and an upsert-only sync would leave it on the calendar
 * forever.
 *
 * The window is deliberately narrow — a few months either side of today —
 * because the calendar screen pages within that range and a decade of a
 * recurring standup is a decade of rows nobody looks at.
 */

/** How far either side of today the mirror keeps. */
export const WINDOW_MONTHS_BACK = 3;
export const WINDOW_MONTHS_AHEAD = 9;

/** A feed that will not load must not take the whole sync down with it. */
export interface FeedResult {
  integrationId: string;
  events?: number;
  /** Series whose recurrence rule the reader does not expand. */
  unexpandedSeries?: number;
  error?: string;
}

function windowAround(now: Date): { from: Date; to: Date } {
  const from = new Date(now.getTime());
  from.setUTCMonth(from.getUTCMonth() - WINDOW_MONTHS_BACK);
  const to = new Date(now.getTime());
  to.setUTCMonth(to.getUTCMonth() + WINDOW_MONTHS_AHEAD);
  return { from, to };
}

export async function pullCalendarFeeds(
  now: Date = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): Promise<FeedResult[]> {
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
        eq(integrations.provider, "gcal"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const { from, to } = windowAround(now);
  const results: FeedResult[] = [];

  for (const conn of connections) {
    try {
      const url = open(conn.secretBox as string, key);
      const res = await timeoutFetch(url, { headers: { Accept: "text/calendar" } });
      if (!res.ok) {
        throw new Error(`Calendar feed failed (${res.status}).`);
      }
      const calendar = parseIcs(await res.text(), from, to);

      const rows = calendar.events.map((e) => ({
        integrationId: conn.id,
        clientId: conn.clientId,
        // uid + start: one INSTANCE of a series. A uid alone would collapse a
        // weekly standup into one row.
        occurrenceKey: `${e.uid}|${e.start.toISOString()}`,
        summary: e.summary,
        startsAt: e.start,
        endsAt: e.end,
        allDay: e.allDay,
        dayKey: dayKeyIn(e.start, timeZone),
        syncedAt: now,
      }));

      await db.transaction(async (tx) => {
        await tx
          .delete(calendarFeedEvents)
          .where(eq(calendarFeedEvents.integrationId, conn.id));
        // Two instances of a series can share a key only if the feed repeats
        // itself; the unique index would reject the batch, so the last one wins.
        const seen = new Map<string, (typeof rows)[number]>();
        for (const r of rows) seen.set(r.occurrenceKey, r);
        const unique = [...seen.values()];
        if (unique.length > 0) await tx.insert(calendarFeedEvents).values(unique);
      });

      await db
        .update(integrations)
        .set({
          lastSyncAt: now,
          lastSyncNote: `${rows.length} events${
            calendar.unexpandedSeries > 0
              ? `, ${calendar.unexpandedSeries} repeating series not expanded`
              : ""
          }`,
          updatedAt: now,
        })
        .where(eq(integrations.id, conn.id));

      results.push({
        integrationId: conn.id,
        events: rows.length,
        unexpandedSeries: calendar.unexpandedSeries,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Calendar pull failed.";
      // The mirror is LEFT ALONE on a failure: yesterday's events are better
      // than an empty calendar, and the note says the pull did not land.
      await db
        .update(integrations)
        .set({ lastSyncNote: failureNote(message), updatedAt: now })
        .where(eq(integrations.id, conn.id));
      results.push({ integrationId: conn.id, error: message });
    }
  }

  return results;
}
