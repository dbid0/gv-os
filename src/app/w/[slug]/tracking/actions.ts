"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullShareTranscripts } from "@/lib/calls/share-transcripts";
import { currentSnapshot } from "@/lib/tracking/queries";
import { syncClientTrackingSheet } from "@/lib/tracking/sync";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/**
 * Pull this client's tracking sheet now.
 *
 * Owner-only: the sheet is GV's operational mirror, and a sync is a write.
 * Returns the error rather than throwing so the page can say what went wrong
 * (no sheet linked, sheet not shared with the agency account) instead of
 * showing a blank.
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

  const result = await syncClientTrackingSheet(client.id);
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
