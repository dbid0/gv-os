import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullStripeEvents } from "@/lib/payments/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull-based payment capture (Stripe today). Secret-gated like the
 * finance-sheet sync — and deliberately no DISABLE_AUTH bypass.
 */
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
    const results = await pullStripeEvents();
    return NextResponse.json({ ok: true, connections: results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Pull failed." },
      { status: 500 },
    );
  }
}
