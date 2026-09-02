import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { analyzePendingCalls } from "@/lib/calls/call-analysis-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs the call read over pending transcripts. Secret-gated, like the pulls. */
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
  try {
    return NextResponse.json({ ok: true, ...(await analyzePendingCalls()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Analysis failed." },
      { status: 500 },
    );
  }
}
