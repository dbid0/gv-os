import "server-only";

import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { after } from "next/server";

import { getDb } from "@/db/client";
import { clientTrackingSyncs, integrations } from "@/db/schema/app";
import { syncProviderNow } from "@/lib/integrations/sync-on-connect";
import { syncClientStripe } from "@/lib/tracking/stripe-sync";
import { syncClientTrackingSheet } from "@/lib/tracking/sync";

/**
 * LIVE WHEN YOU'RE LOOKING.
 *
 * The continuous loop keeps every connection fresh in the background; this
 * closes the last gap — opening a page that shows a provider's data kicks a
 * pull AFTER the response is sent (next/server `after`), so the render is never
 * slowed and the data is current by your next glance.
 *
 * Throttled to one minute: nothing fires if the provider synced within it, so
 * a team clicking around cannot stampede a rate limit. The mirror stays the
 * read path — a 30-day median needs history no live peek can supply.
 */
const FRESH_WINDOW_MS = 60 * 1000;

export function refreshProviderOnView(provider: string): void {
  refreshProvidersOnView([provider]);
}

/**
 * Several providers at once, for the pages that show more than one feed —
 * the calendar (iClosed, Calendly, a calendar feed), the sales floor, the
 * dashboard.
 *
 * One query decides which of them are already fresh; only the stale ones are
 * pulled, one after another, after the response has gone. A page that shows
 * five feeds therefore costs a single cheap read when everything is current,
 * which is almost always, because the continuous loop keeps it that way.
 */
export function refreshProvidersOnView(providers: string[]): void {
  if (providers.length === 0) return;
  after(async () => {
    try {
      const db = getDb();
      const fresh = await db
        .select({ provider: integrations.provider })
        .from(integrations)
        .where(
          and(
            inArray(integrations.provider, providers),
            eq(integrations.status, "connected"),
            isNotNull(integrations.lastSyncAt),
            gte(integrations.lastSyncAt, new Date(Date.now() - FRESH_WINDOW_MS)),
          ),
        );
      const freshSet = new Set(fresh.map((r) => r.provider));
      // Sequential, not parallel: a page view must never fan out into a burst
      // against several third-party rate limits at once.
      for (const provider of providers) {
        if (!freshSet.has(provider)) await syncProviderNow(provider);
      }
    } catch {
      // A failed freshness pull must never surface — the continuous loop is
      // the guaranteed path; this is only the "you're looking at it" bonus.
    }
  });
}

/** The tracking snapshots that own the offer money headline + funnel. */
const MONEY_SNAPSHOT_SOURCES = ["stripe", "sheet"];

/**
 * SAME IDEA, FOR THE MONEY MIRROR.
 *
 * The offer money headline and the funnel read the Stripe / sheet tracking
 * SNAPSHOTS (`client_tracking_syncs`), not the integrations feed — a different
 * pipeline (`syncClientStripe` / `syncClientTrackingSheet`) that
 * `refreshProviderOnView` above never touches. So opening a workspace closes
 * the same last gap for those snapshots: an intraday payment or a fresh row is
 * pulled AFTER the response is sent, and is current by the next glance.
 *
 * Throttled on the SAME window as the provider path — nothing fires if either
 * money snapshot for this client is younger than the window — so a team
 * clicking between offers cannot stampede Stripe or the Sheets API. The
 * continuous loop stays the guaranteed path; this is only the bonus.
 */
export function refreshTrackingSnapshotsOnView(clientId: string): void {
  after(async () => {
    try {
      const db = getDb();
      const [recent] = await db
        .select({ createdAt: clientTrackingSyncs.createdAt })
        .from(clientTrackingSyncs)
        .where(
          and(
            eq(clientTrackingSyncs.clientId, clientId),
            inArray(clientTrackingSyncs.source, MONEY_SNAPSHOT_SOURCES),
            gte(clientTrackingSyncs.createdAt, new Date(Date.now() - FRESH_WINDOW_MS)),
          ),
        )
        .orderBy(desc(clientTrackingSyncs.createdAt))
        .limit(1);
      // A money snapshot landed inside the window already — leave it alone.
      if (recent) return;
      // Processor history is finite upstream; ninety days matches the
      // scheduled pull (api/sync/tracking) so a re-link never re-reads the
      // world. A missing connection / sheet is a quiet no-op inside each sync.
      const stripeSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);
      await Promise.allSettled([
        syncClientTrackingSheet(clientId),
        syncClientStripe(clientId, stripeSince),
      ]);
    } catch {
      // Same contract as the provider path: a failed freshness pull is silent.
      // The scheduler is the guaranteed path; this is only the bonus.
    }
  });
}
