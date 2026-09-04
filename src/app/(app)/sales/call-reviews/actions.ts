"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { callRecordings } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/**
 * Clear one call from the review queue.
 *
 * A timestamp, not a delete: the read stays on the lead's record forever, this
 * only takes it out of the manager's inbox. Re-marking an already-cleared call
 * is a no-op rather than an error — two managers clicking at once is normal.
 */
export async function markCallReviewed(recordingId: string) {
  await requireUser();
  const db = getDb();
  await db
    .update(callRecordings)
    .set({ reviewedAt: new Date() })
    .where(eq(callRecordings.id, recordingId));
  revalidatePath("/sales/call-reviews");
  revalidatePath("/notifications");
  return { ok: true };
}

/** Put a call back in the queue — an undo for a mis-click. */
export async function reopenCallReview(recordingId: string) {
  await requireUser();
  const db = getDb();
  await db
    .update(callRecordings)
    .set({ reviewedAt: null })
    .where(eq(callRecordings.id, recordingId));
  revalidatePath("/sales/call-reviews");
  return { ok: true };
}
