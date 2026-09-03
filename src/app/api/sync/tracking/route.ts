import { NextResponse, type NextRequest } from "next/server";
import { eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullShareTranscripts } from "@/lib/calls/share-transcripts";
import { syncClientTrackingSheet } from "@/lib/tracking/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Pulling ten tabs and up to forty transcripts is slow; give it room. */
export const maxDuration = 300;

/**
 * Tracking-sheet sync trigger.
 *
 * MANUAL, like the new-deals importer, and for the same reason: it reads live
 * client sheets and should run when someone means it, not on a schedule nobody
 * is watching. A signed-in admin or `Authorization: Bearer <SYNC_SECRET>` can
 * run it; everything else is 401.
 *
 *   ?slug=the-grid        one offer
 *   (no slug)             every offer with a tracking sheet linked
 *   &transcripts=1        also pull the Fathom transcripts behind EOC reports
 *
 * Idempotent: the sheet pull writes a fresh snapshot, and transcripts already
 * held are skipped, so re-running costs a read and changes nothing.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const withTranscripts = url.searchParams.get("transcripts") === "1";

  const db = getDb();
  const offers = await db
    .select({ id: clients.id, slug: clients.slug })
    .from(clients)
    .where(slug ? eq(clients.slug, slug) : isNotNull(clients.trackingSheetId));

  const results: Record<string, unknown> = {};
  for (const offer of offers) {
    try {
      const sync = await syncClientTrackingSheet(offer.id);
      if (sync.error) {
        results[offer.slug] = { error: sync.error };
        continue;
      }
      const entry: Record<string, unknown> = {
        rows: sync.rowCount,
        tabs: sync.tabs.map((t) => ({ tab: t.tab, rows: t.rows, dated: t.dated })),
      };
      if (withTranscripts && sync.syncId) {
        entry.transcripts = await pullShareTranscripts(offer.id, sync.syncId);
      }
      results[offer.slug] = entry;
    } catch (e) {
      results[offer.slug] = {
        error: e instanceof Error ? e.message : "sync failed",
      };
    }
  }
  return NextResponse.json({ ok: true, offers: results });
}

export const GET = run;
export const POST = run;
