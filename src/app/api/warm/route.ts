import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { prewarmJwks } from "@/lib/auth/verify-jwt";
import { dayKeyCT } from "@/lib/charts";
import { loadRoster } from "@/lib/roster-server";
import { getRepTrends } from "@/lib/sales/rep-trends-query";
import { getSettings } from "@/lib/settings";
import { listTransactions } from "@/lib/transactions/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The REAL warmer. /api/health keeps the function process and a DB socket
 * alive, but the keep-warm page pings bounce off the login wall — so the
 * dashboard's actual work (its query modules, the roster and settings caches,
 * the JWKS fetch) stayed cold and the first signed-in visit after an idle
 * stretch paid all of it at once. This route runs that same work under the
 * sync routes' bearer secret, so a scheduled ping keeps the path a real
 * visitor takes hot. Read-only by construction: every callee is a query.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const started = Date.now();
  const timed = async (work: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      await work();
      return Date.now() - t;
    } catch {
      return -1; // a failed leg still reports; the warmer never 500s
    }
  };
  const [transactions, roster, settings, trends, jwks] = await Promise.all([
    timed(() => listTransactions({})),
    timed(() => loadRoster()),
    timed(() => getSettings()),
    timed(() => getRepTrends(dayKeyCT(new Date()))),
    timed(() => prewarmJwks()),
  ]);
  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    legs: { transactions, roster, settings, trends, jwks },
  });
}
