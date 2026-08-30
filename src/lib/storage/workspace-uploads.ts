import "server-only";

import { createClient as createServiceClient } from "@supabase/supabase-js";

import { publicEnv } from "@/env";
import { serverEnv } from "@/env.server";
import { createClient as createAuthedClient } from "@/lib/auth/server";
import { MAX_UPLOAD_BYTES, WORKSPACE_UPLOADS_BUCKET } from "@/lib/storage/constants";

/**
 * Uploading a workspace attachment (image / video / file) to Supabase Storage.
 *
 * Two paths, picked by which key exists:
 *
 *   1. SERVICE ROLE (preferred). When SUPABASE_SERVICE_ROLE_KEY is set, an admin
 *      client uploads directly, bypassing Storage RLS. It can also create the
 *      bucket idempotently, so no manual setup is needed — the moment the env
 *      var lands, uploads work end to end.
 *
 *   2. AUTHENTICATED ANON (fallback). With only the anon key + the caller's
 *      session, the upload runs as the signed-in user under Storage RLS. This
 *      requires the bucket AND an INSERT policy for `authenticated` to already
 *      exist (see drizzle/manual/0001_workspace_uploads_bucket.sql). The anon
 *      key cannot create a bucket, so that one-time SQL is the setup for this
 *      path.
 *
 * The route handler enforces auth and the size cap before this runs; this module
 * only moves bytes and returns the public URL BlockNote embeds.
 */

function serviceRoleKey(): string | undefined {
  return serverEnv().SUPABASE_SERVICE_ROLE_KEY;
}

/** True when a server-side upload can create its own bucket and skip RLS. */
export function hasServiceRoleKey(): boolean {
  return Boolean(serviceRoleKey());
}

/**
 * A stable, collision-proof object path. Namespaced by page so a page's
 * attachments are easy to find (and easy to sweep if the page is deleted), with
 * a random prefix so re-uploading the same filename never overwrites.
 */
function buildObjectPath(pageId: string | null, filename: string): string {
  const safeName =
    filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(-100) || "file";
  const scope = pageId && /^[0-9a-f-]{36}$/i.test(pageId) ? pageId : "misc";
  return `workspace/${scope}/${crypto.randomUUID()}-${safeName}`;
}

/**
 * Upload one file and return its public URL. Throws on failure with a message
 * the route surfaces to the editor's error toast.
 */
export async function uploadWorkspaceFile(
  file: File,
  opts: { pageId?: string | null } = {},
): Promise<string> {
  const path = buildObjectPath(opts.pageId ?? null, file.name);
  const contentType = file.type || "application/octet-stream";
  const body = new Uint8Array(await file.arrayBuffer());
  const key = serviceRoleKey();

  if (key) {
    const admin = createServiceClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create the bucket idempotently. A parallel first upload can win the race,
    // so an "already exists" error is success.
    const { data: bucket } = await admin.storage.getBucket(WORKSPACE_UPLOADS_BUCKET);
    if (!bucket) {
      const { error: bucketError } = await admin.storage.createBucket(
        WORKSPACE_UPLOADS_BUCKET,
        { public: true, fileSizeLimit: MAX_UPLOAD_BYTES },
      );
      if (
        bucketError &&
        !/already exists|resource already exists/i.test(bucketError.message)
      ) {
        throw bucketError;
      }
    }

    const { error } = await admin.storage
      .from(WORKSPACE_UPLOADS_BUCKET)
      .upload(path, body, { contentType, upsert: false });
    if (error) throw error;
    return admin.storage.from(WORKSPACE_UPLOADS_BUCKET).getPublicUrl(path).data
      .publicUrl;
  }

  // Fallback: run as the signed-in user under Storage RLS. The bucket + policy
  // must already exist (the anon key cannot create a bucket).
  const supabase = await createAuthedClient();
  const { error } = await supabase.storage
    .from(WORKSPACE_UPLOADS_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) {
    // Turn the opaque RLS/"bucket not found" failure into an actionable message.
    if (/not found|does not exist/i.test(error.message)) {
      throw new Error(
        "Uploads aren't set up yet: add SUPABASE_SERVICE_ROLE_KEY, or create the workspace-uploads bucket.",
      );
    }
    throw error;
  }
  return supabase.storage.from(WORKSPACE_UPLOADS_BUCKET).getPublicUrl(path).data
    .publicUrl;
}
