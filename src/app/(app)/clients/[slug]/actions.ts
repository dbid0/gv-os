"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { driveFolderIdValid } from "@/lib/google/drive-kind";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/** Point a client at its Drive root. Empty input clears the link. */
export async function saveDriveFolder(slug: string, rawFolderId: string) {
  await requireUser();
  const folderId = rawFolderId.trim();
  if (folderId && !driveFolderIdValid(folderId)) {
    throw new Error(
      "That doesn't look like a Drive folder id — copy it from the folder's URL.",
    );
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ driveFolderId: folderId || null })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  return { saved: true };
}
