import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullPandaDocSigned, pullTypeformApplications } from "@/lib/docs/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** PandaDoc signed docs + Typeform applications. Secret-gated. */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const out: Record<string, unknown> = {};
  try {
    out.pandadoc = await pullPandaDocSigned();
  } catch (e) {
    out.pandadoc = { error: e instanceof Error ? e.message : "failed" };
  }
  try {
    out.typeform = await pullTypeformApplications();
  } catch (e) {
    out.typeform = { error: e instanceof Error ? e.message : "failed" };
  }
  return NextResponse.json({ ok: true, ...out });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
