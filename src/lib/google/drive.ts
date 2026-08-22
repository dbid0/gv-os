import "server-only";

import { googleAccessToken } from "@/lib/google/sheets";
import { driveFolderIdValid } from "@/lib/google/drive-kind";

/**
 * Client Drive assets — a live read of the client's folder through the sealed
 * agency Google credential. A browse surface, not analytics: nothing is
 * captured or stored, so there is no staging table and no sync job.
 */

export interface DriveAsset {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string | null;
}

export async function listDriveFolder(folderId: string): Promise<DriveAsset[]> {
  if (!driveFolderIdValid(folderId)) {
    throw new Error("Not a valid Drive folder id.");
  }
  const token = await googleAccessToken();
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: "folder,modifiedTime desc",
    pageSize: "20",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    files?: {
      id?: string;
      name?: string;
      mimeType?: string;
      modifiedTime?: string;
      webViewLink?: string;
    }[];
  };
  return (body.files ?? [])
    .filter((f) => typeof f.id === "string" && typeof f.name === "string")
    .map((f) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType ?? "application/octet-stream",
      modifiedTime: f.modifiedTime ?? null,
      webViewLink: f.webViewLink ?? null,
    }));
}
