/**
 * Pure Drive helpers: mime type → a human file-kind label, and folder-id
 * validation (Drive ids are URL-safe tokens; validating here keeps untrusted
 * input out of the Drive query string).
 */

const KIND_BY_MIME: Record<string, string> = {
  "application/vnd.google-apps.folder": "Folder",
  "application/vnd.google-apps.document": "Doc",
  "application/vnd.google-apps.spreadsheet": "Sheet",
  "application/vnd.google-apps.presentation": "Slides",
  "application/vnd.google-apps.form": "Form",
  "application/pdf": "PDF",
};

export function driveKindLabel(mimeType: string): string {
  const exact = KIND_BY_MIME[mimeType];
  if (exact) return exact;
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "File";
}

export function isDriveFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder";
}

/** Drive file/folder ids: URL-safe token, long enough to be real. */
export function driveFolderIdValid(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,}$/.test(id);
}
