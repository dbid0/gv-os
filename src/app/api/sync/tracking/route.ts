import { NextResponse, type NextRequest } from "next/server";
import { eq, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullShareTranscripts } from "@/lib/calls/share-transcripts";
import { pushApplicantsToClose } from "@/lib/crm/close-push";
import { syncClientStripe } from "@/lib/tracking/stripe-sync";
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
  // With a slug: that offer. Without: every offer that has ANY feed — a
  // linked sheet or a connected processor. An offer with only Stripe (a
  // Base 44 play) must not be skipped for lacking a sheet.
  const offers = await db
    .select({ id: clients.id, slug: clients.slug, sheet: clients.trackingSheetId })
    .from(clients)
    .where(slug ? eq(clients.slug, slug) : ne(clients.status, "archived"));

  // Processor history is finite upstream; ninety days covers a re-link
  // without re-reading the world. The sheet pull is always the whole sheet.
  const stripeSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);

  const results: Record<string, unknown> = {};
  for (const offer of offers) {
    const entry: Record<string, unknown> = {};
    try {
      if (offer.sheet) {
        const sync = await syncClientTrackingSheet(offer.id);
        if (sync.error) {
          entry.sheet = { error: sync.error };
        } else {
          entry.sheet = {
            rows: sync.rowCount,
            tabs: sync.tabs.map((t) => ({ tab: t.tab, rows: t.rows, dated: t.dated })),
          };
          if (withTranscripts && sync.syncId) {
            entry.transcripts = await pullShareTranscripts(offer.id, sync.syncId);
          }
        }
      }
      // The processor's own record, through the same snapshot spine. A
      // missing connection is a quiet skip here — the Sources panel already
      // says plainly what is and isn't connected.
      const stripe = await syncClientStripe(offer.id, stripeSince);
      if (stripe.error) {
        if (!stripe.error.includes("isn't connected"))
          entry.stripe = { error: stripe.error };
      } else {
        entry.stripe = { charges: stripe.chargeCount, rows: stripe.rowCount };
      }
      // Applications become CRM leads — the handoff speed-to-lead depends on.
      // Quiet skip when Close isn't connected.
      const push = await pushApplicantsToClose(offer.id, stripeSince);
      if (push.error) {
        if (!push.error.includes("isn't connected"))
          entry.closePush = { error: push.error };
      } else {
        entry.closePush = {
          applicants: push.applicants,
          alreadyInCrm: push.alreadyInCrm,
          created: push.created,
        };
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
