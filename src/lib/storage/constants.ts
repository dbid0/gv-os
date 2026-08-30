/**
 * Workspace upload constants.
 *
 * Client-safe on purpose (no `server-only` guard, no secrets): the block editor
 * reads MAX_UPLOAD_BYTES in the browser to reject an oversized file before it
 * ever hits the network, and the server helper reads the same values so the
 * limit is defined exactly once.
 */

/** Supabase Storage bucket that holds every workspace attachment (public-read). */
export const WORKSPACE_UPLOADS_BUCKET = "workspace-uploads";

/** Hard cap on a single upload. Kept sane so a stray 4K video can't wedge a page. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

/** The cap rendered for humans ("50MB"). */
export const MAX_UPLOAD_LABEL = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`;
