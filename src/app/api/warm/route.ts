import { NextResponse, type NextRequest } from "next/server";

import { getAgencyReconciliation } from "@/lib/accounting/reconcile-agency-query";
import { getSpineReconciliation } from "@/lib/accounting/reconcile-spine-query";
import {
  latestReconciliation,
  mirrorMonthly,
  mirrorOutstanding,
} from "@/lib/accounting/sheet-sync";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { prewarmJwks } from "@/lib/auth/verify-jwt";
import { dayKeyCT } from "@/lib/charts";
import { getClientReport } from "@/lib/clients/report";
import { listApplications } from "@/lib/funnel/queries";
import { loadRoster } from "@/lib/roster-server";
import { listCallLogs } from "@/lib/sales/call-queries";
import { getEodCompliance, listActivityReports, listDeals } from "@/lib/sales/queries";
import { listQuotasWithPacing } from "@/lib/sales/quota-queries";
import { getRepTrends } from "@/lib/sales/rep-trends-query";
import { getSettings } from "@/lib/settings";
import { listTransactions } from "@/lib/transactions/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The REAL warmer. /api/health keeps the function process and a DB socket
 * alive, but the keep-warm page pings bounce off the login wall — so the
 * real work behind every heavy route (its query modules, its caches, the
 * JWKS fetch) stayed cold and the first signed-in visit after an idle
 * stretch paid all of it at once. This route runs that same work under the
 * sync routes' bearer secret, so a scheduled ping keeps the paths a real
 * visitor takes hot — now the dashboard AND the query-heaviest pages
 * (reconciliation, sales/client reports, the daily brief). Read-only by
 * construction: every callee below is a query or a report, nothing writes
 * and nothing touches the ledger.
 *
 * THE POOL LAW (src/db/client.ts) — a single request must keep its own
 * burst well under the pool's max, because queries in flight beyond max get
 * pipelined onto busy connections and Supabase's transaction pooler never
 * answers a pipelined simple query: the request doesn't slow down, it hangs
 * forever. Several of the loaders below already burst internally (the money
 * spine reconciler alone fires 5 queries at once; one client report fires
 * 6). So this warmer runs in SEQUENTIAL PHASES — each phase's legs run
 * concurrently with each other (same shape as the page that owns them), but
 * the phases themselves run one after another, so this request's own peak
 * concurrent query count never stacks on top of itself. A cron warmer has
 * nowhere to be; trading a couple hundred extra idle milliseconds for never
 * being the request that tips the pool over is the correct trade.
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

  // Phase 1 — the dashboard's own loaders (unchanged from the original warmer).
  const [transactions, roster, settings, trends, jwks] = await Promise.all([
    timed(() => listTransactions({})),
    timed(() => loadRoster()),
    timed(() => getSettings()),
    timed(() => getRepTrends(dayKeyCT(new Date()))),
    timed(() => prewarmJwks()),
  ]);

  // Phase 2 — the sheet-mirror reconciliation trio. All three share one
  // cached "latest sync run" lookup under the hood (see sheet-sync.ts), so
  // together they add at most one extra query beyond their own three.
  const [reconLatest, reconMonthly, reconOutstanding] = await Promise.all([
    timed(() => latestReconciliation()),
    timed(() => mirrorMonthly()),
    timed(() => mirrorOutstanding()),
  ]);

  // Phase 3 — the Money Spine reconcilers. getSpineReconciliation alone
  // bursts 5 queries internally, so it gets its own phase rather than
  // stacking on Phase 2's queries.
  const [reconSpine, reconAgency] = await Promise.all([
    timed(() => getSpineReconciliation()),
    timed(() => getAgencyReconciliation()),
  ]);

  // Phase 4 — one client report per active client, the same read the
  // /sales landing and each client's own accounting page show. Sequential
  // on purpose: getClientReport bursts 6 queries per client internally, and
  // the roster is small enough that sequential costs milliseconds, not
  // seconds. Each client is caught on its own (mirrors how /sales itself
  // treats a reporting hiccup as "—", never a broken page) so one bad
  // client can't stop the rest of the roster from warming.
  const clientReports = await timed(async () => {
    const clients = await loadRoster();
    for (const c of clients) {
      try {
        await getClientReport(c.slug, c.name);
      } catch {
        // A single client's report failing must not skip the rest.
      }
    }
  });

  // Phase 5 — the daily brief's simple, single-query loaders.
  const [briefApplications, briefCalls, briefDeals] = await Promise.all([
    timed(() => listApplications()),
    timed(() => listCallLogs()),
    timed(() => listDeals()),
  ]);

  // Phase 6 — the brief's remaining loaders: EOD/BOD compliance + history,
  // and quota pacing (which itself bursts up to 3 aggregate queries).
  const [
    briefEodCompliance,
    briefBodCompliance,
    briefEodReports,
    briefBodReports,
    briefQuotas,
  ] = await Promise.all([
    timed(() => getEodCompliance("eod")),
    timed(() => getEodCompliance("bod")),
    timed(() => listActivityReports("eod")),
    timed(() => listActivityReports("bod")),
    timed(() => listQuotasWithPacing(Date.now())),
  ]);

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    legs: {
      transactions,
      roster,
      settings,
      trends,
      jwks,
      reconLatest,
      reconMonthly,
      reconOutstanding,
      reconSpine,
      reconAgency,
      clientReports,
      briefApplications,
      briefCalls,
      briefDeals,
      briefEodCompliance,
      briefBodCompliance,
      briefEodReports,
      briefBodReports,
      briefQuotas,
    },
  });
}
