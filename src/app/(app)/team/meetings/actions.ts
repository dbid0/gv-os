"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { meetingNotes } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/**
 * Trash a recorded call. Removes the recap + transcript only; any tasks it
 * already created live on independently on the Work board (delete those there
 * if you want them gone too).
 */
export async function deleteMeeting(id: string) {
  await requireUser();
  const meetingId = z.string().uuid().parse(id);
  const db = getDb();
  await db.delete(meetingNotes).where(eq(meetingNotes.id, meetingId));
  revalidatePath("/team/meetings");
  return { ok: true };
}
