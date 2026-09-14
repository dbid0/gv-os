"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientColumnMap, clients } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullShareTranscripts } from "@/lib/calls/share-transcripts";
import { currentSnapshot } from "@/lib/tracking/queries";
import { syncClientStripe } from "@/lib/tracking/stripe-sync";
import { syncClientTrackingSheet } from "@/lib/tracking/sync";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/**
 * Pull this client's tracking sheet AND its Stripe money snapshot now.
 *
 * Owner-only: the sheet is GV's operational mirror, and a sync is a write.
 * Returns the error rather than throwing so the page can say what went wrong
 * (no sheet linked, sheet not shared with the agency account) instead of
 * showing a blank.
 *
 * The Stripe snapshot rides along on purpose: the offer money headline wins
 * from the Stripe tracking snapshot, so a "Sync now" that refreshed only the
 * sheet left an intraday payment invisible on the headline until the next
 * scheduled pull. A missing Stripe connection is a quiet no-op (the sheet
 * result still stands), never an error that hides a successful sheet sync.
 */
export async function syncTrackingSheet(slug: string) {
  await requireUser();
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!client) return { error: "No client for this slug." };

  // Ninety days matches the scheduled pull (api/sync/tracking) so a re-link
  // never re-reads the world.
  const stripeSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const [result] = await Promise.all([
    syncClientTrackingSheet(client.id),
    syncClientStripe(client.id, stripeSince),
  ]);
  revalidatePath(`/w/${slug}/tracking`);
  revalidatePath(`/w/${slug}`);
  return { error: result.error, rowCount: result.rowCount };
}

/**
 * Fetch the transcript behind every EOC report's recording link.
 *
 * Owner-only, and separate from the sheet sync on purpose: pulling 25
 * transcripts is slow, and a person should choose when to do it rather than
 * have every sheet refresh wait on the network.
 */
export async function pullTranscripts(slug: string) {
  await requireUser();
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  if (!client) return { error: "No client for this slug." };

  const snapshot = await currentSnapshot(client.id);
  if (!snapshot) {
    return { error: "Sync the tracking sheet first — there are no EOC rows yet." };
  }

  const res = await pullShareTranscripts(client.id, snapshot.syncId);
  revalidatePath(`/w/${slug}/tracking`);
  revalidatePath(`/w/${slug}/leads`);
  return {
    error: null,
    message:
      res.considered === 0
        ? "No EOC rows carry a recording link."
        : `${res.fetched} pulled, ${res.alreadyHad} already held${res.failed ? `, ${res.failed} failed` : ""}.`,
  };
}

/**
 * Approve or discard a proposed column meaning.
 *
 * Approving is what makes a mapping real: until then the sync ignores it
 * entirely, so nothing a model suggested can move a number on its own. This
 * is the whole safety argument for letting a model read the sheet at all.
 */
export async function decideColumnMapping(slug: string, id: string, approve: boolean) {
  await requireUser();
  const db = getDb();
  if (approve) {
    await db
      .update(clientColumnMap)
      .set({ approvedAt: new Date() })
      .where(eq(clientColumnMap.id, id));
  } else {
    // Discarding removes the row so the proposer can look again later with
    // better sample data, rather than leaving a permanent "no".
    await db.delete(clientColumnMap).where(eq(clientColumnMap.id, id));
  }
  revalidatePath(`/w/${slug}/tracking`);
  return { ok: true };
}
