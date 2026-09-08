import "server-only";

import { and, eq, gte, isNotNull } from "drizzle-orm";
import { after } from "next/server";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { syncProviderNow } from "@/lib/integrations/sync-on-connect";

/**
 * LIVE WHEN YOU'RE LOOKING.
 *
 * The scheduler keeps every connection fresh in the background; this closes
 * the last gap — opening a page that shows a provider's data kicks a pull
 * AFTER the response is sent (next/server `after`), so the render is never
 * slowed and the data is current by your next glance.
 *
 * Throttled: nothing fires if the provider synced within the window, so a
 * team clicking around cannot stampede a rate limit. The mirror stays the
 * read path — a 30-day median needs history no live peek can supply.
 */
const FRESH_WINDOW_MS = 3 * 60 * 1000;

export function refreshProviderOnView(provider: string): void {
  after(async () => {
    try {
      const db = getDb();
      const fresh = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(
          and(
            eq(integrations.provider, provider),
            eq(integrations.status, "connected"),
            isNotNull(integrations.lastSyncAt),
            gte(integrations.lastSyncAt, new Date(Date.now() - FRESH_WINDOW_MS)),
          ),
        )
        .limit(1);
      // Someone (the scheduler, another viewer) already pulled just now.
      if (fresh.length > 0) return;
      await syncProviderNow(provider);
    } catch {
      // A failed freshness pull must never surface — the scheduler is the
      // guaranteed path; this is only the "you're looking at it" bonus.
    }
  });
}
