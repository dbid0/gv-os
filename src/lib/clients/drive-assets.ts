import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { listDriveFolder, type DriveAsset } from "@/lib/google/drive";

/**
 * The client-page Drive slice: the stored folder id plus a live listing
 * through the sealed agency credential. Read failures land as a message, not
 * a crash — the client page must render with Drive down.
 */
export interface ClientDriveAssets {
  folderId: string | null;
  assets: DriveAsset[];
  error: string | null;
}

export async function getClientDriveAssets(slug: string): Promise<ClientDriveAssets> {
  const db = getDb();
  const [row] = await db
    .select({ driveFolderId: clients.driveFolderId })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const folderId = row?.driveFolderId ?? null;
  if (!folderId) return { folderId: null, assets: [], error: null };
  try {
    return { folderId, assets: await listDriveFolder(folderId), error: null };
  } catch (e) {
    return {
      folderId,
      assets: [],
      error: e instanceof Error ? e.message : "Drive read failed.",
    };
  }
}
