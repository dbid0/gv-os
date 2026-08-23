"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { parseTargetDollars } from "@/lib/clients/targets";
import { driveFolderIdValid } from "@/lib/google/drive-kind";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
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
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}

/** Set the client's monthly cash target in dollars. Empty input clears it. */
export async function saveMonthlyTarget(slug: string, rawDollars: string) {
  await requireUser();
  const parsed = parseTargetDollars(rawDollars);
  if (parsed === "invalid") {
    throw new Error("Enter the target in dollars — like 25000 or $25,000.");
  }
  const db = getDb();
  const updated = await db
    .update(clients)
    .set({ monthlyTargetCents: parsed })
    .where(eq(clients.slug, slug))
    .returning({ id: clients.id });
  if (updated.length === 0) {
    throw new Error("No client row for this slug yet — sync creates it.");
  }
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/w/${slug}`);
  return { saved: true };
}
