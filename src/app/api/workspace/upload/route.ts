import { NextResponse } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { currentUser } from "@/lib/auth/server";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/storage/constants";
import { uploadWorkspaceFile } from "@/lib/storage/workspace-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workspace attachment upload (image / video / file), called by the BlockNote
 * editor's `uploadFile`. Returns `{ url }` — the public URL the block embeds.
 *
 * Not on the middleware's public allowlist, so it already requires a signed-in,
 * allowlisted user; the same check is repeated here (matching the workspace
 * server actions) so the route is safe on its own.
 */

async function requireUser(): Promise<boolean> {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

export async function POST(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is too large. The limit is ${MAX_UPLOAD_LABEL}.` },
      { status: 413 },
    );
  }

  const pageIdRaw = form.get("pageId");
  const pageId = typeof pageIdRaw === "string" && pageIdRaw ? pageIdRaw : null;

  try {
    const url = await uploadWorkspaceFile(file, { pageId });
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
