import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { applications, clients, reps as repsTable } from "@/db/schema/app";
import { bucketByDay, chartColorForClient } from "@/lib/charts";
import { getClientReport } from "@/lib/clients/report";
import { cents } from "@/lib/money";
import { clientBySlug } from "@/lib/roster";
import {
  aggregateByRep,
  compareRepStats,
  dispositionLabel,
  summarizeActivity,
} from "@/lib/sales/call-activity";
import { listCallLogs } from "@/lib/sales/call-queries";
import { listDeals } from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

/**
 * Workspace → Sales: THIS offer's sales command center.
 *
 * Daniel's call: sales is per-offer and lives inside the client workspace, not
 * as a separate top-level section. So this is the whole picture for one offer —
 * cash, deals, the rep leaderboard, recent calls, and the application flow —
 * rather than the applications-only view it used to be.
 *
 * Every figure is READ from an existing tested source and filtered to this
 * client: cash from `getClientReport` (the same client-ledger figure the
 * accounting page shows), deals from `listDeals`, calls from `listCallLogs`,
 * and the leaderboard from the pure `aggregateByRep`. Nothing is recomputed
 * here, so this page can never disagree with the pages beside it.
 */
export default async function WorkspaceSalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const clientId = row?.id ?? null;

  const now = new Date();
  const daysAgo30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [apps, allCalls, allDeals, report, repRows] = await Promise.all([
    clientId
      ? db
          .select({
            name: applications.name,
            email: applications.email,
            formName: applications.formName,
            submittedAt: applications.submittedAt,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .where(
            and(
              eq(applications.clientId, clientId),
              gte(applications.createdAt, daysAgo30),
            ),
          )
          .orderBy(desc(applications.createdAt))
          .limit(100)
      : Promise.resolve([]),
    listCallLogs(500),
    listDeals(),
    getClientReport(slug, client.name).catch(() => null),
    clientId
      ? db
          .select({ id: repsTable.id, name: repsTable.name })
          .from(repsTable)
          .where(eq(repsTable.clientId, clientId))
      : Promise.resolve([]),
  ]);

  // Everything below is THIS offer only.
  const calls = allCalls.filter((c) => c.clientId === clientId);
  const deals = allDeals.filter((d) => d.clientId === clientId);
  const stats = summarizeActivity(calls);
  const repName = new Map(repRows.map((r) => [r.id, r.name]));
  const board = aggregateByRep(calls).sort(compareRepStats).slice(0, 8);

  const perDay = bucketByDay(
    apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    now,
  );
  const color = chartColorForClient(slug);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cash collected — all time"
          value={report ? <Money amount={cents(report.mirror.cashCents)} /> : "—"}
          tone="brand"
        />
        {/* The mirror's own count, not the deals table's. This KPI sits
            beside "Cash collected — all time", which IS the mirror, and the
            dashboard reports the same pair — a count from one source next to
            cash from another, under one label, is two definitions of the same
            word on two tabs of the same offer. Logged deals still appear in
            the list below, where they are labelled as such. */}
        <Kpi label="Deals" value={report ? String(report.mirror.deals) : "—"} />
        <Kpi label="Show rate" value={pct(stats.showRate)} />
        <Kpi label="Close rate" value={pct(stats.closeRate)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Leaderboard"
          aside={<span className="text-faint text-xs">This offer</span>}
        >
          {board.length === 0 ? (
            <p className="text-faint py-8 text-center text-sm">
              No calls logged for this offer yet. The leaderboard fills in as reps log
              activity.
            </p>
          ) : (
            <div className="divide-y">
              {board.map((r, i) => (
                <div key={r.repId} className="flex items-center gap-3 py-2.5">
                  <span className="text-faint w-4 text-xs tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {repName.get(r.repId) ?? "Unassigned"}
                  </span>
                  <span className="text-faint text-xs tabular-nums">
                    {r.calls} calls · {r.sales} sold
                  </span>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums">
                    {pct(r.closeRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent deals">
          {deals.length === 0 ? (
            <p className="text-faint py-8 text-center text-sm">
              No deals logged for this offer yet.
            </p>
          ) : (
            <div className="divide-y">
              {deals.slice(0, 8).map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {d.customerName ?? "—"}
                    {d.repName && <span className="text-faint"> · {d.repName}</span>}
                  </span>
                  <StatusPill tone={d.status === "signed" ? "live" : "pending"}>
                    {d.status}
                  </StatusPill>
                  <span className="text-sm font-semibold tabular-nums">
                    <Money amount={d.cashCollectedCents} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent calls"
        aside={<span className="text-faint text-xs">{calls.length} logged</span>}
      >
        {calls.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No calls logged for this offer yet. They appear here as reps log them, with
            the Fathom recording attached once that connection is live.
          </p>
        ) : (
          <div className="divide-y">
            {calls.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.customerName ?? "—"}
                  {c.repName && <span className="text-faint"> · {c.repName}</span>}
                </span>
                <span className="text-faint text-xs">
                  {dispositionLabel(c.disposition)}
                </span>
                <span className="text-faint w-24 text-right text-xs tabular-nums">
                  {c.occurredAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Applications — last 30 days"
        aside={<span className="text-faint text-xs">{apps.length} in window</span>}
      >
        {apps.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No applications in the last 30 days.
          </p>
        ) : (
          <ColumnChart data={perDay} color={color} />
        )}
      </Panel>
    </div>
  );
}
