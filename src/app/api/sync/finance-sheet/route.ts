import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { runFinanceSheetSync } from "@/lib/accounting/sheet-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trigger the finance-sheet mirror sync.
 *
 * Two ways in: a signed-in allowlisted user (the button on the reconciliation
 * screen), or `Authorization: Bearer <SYNC_SECRET>` for the scheduled drift
 * job. Everything else is 401. The response is a summary only — no client
 * names, no dollar figures.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  // Deliberately NO DISABLE_AUTH bypass here: even when the app's login wall
  // is down for convenience, this machine endpoint stays secret-gated so
  // strangers can't trigger sheet pulls. The in-app Sync button uses the
  // server action, which follows the wall.
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    const summary = await runFinanceSheetSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Sync failed." },
      { status: 500 },
    );
  }
}
