import { notFound } from "next/navigation";
import { Zap } from "lucide-react";

import { offerSpeedToLead } from "@/lib/crm/offer-stl";
import { closesPaid } from "@/lib/tracking/closes-paid";
import { cashRowsForClient, currentSnapshot } from "@/lib/tracking/queries";
import {
  isPortalView,
  portalShows,
  portalVisibility,
} from "@/lib/clients/portal-visibility";
import { and, desc, eq, gte } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Money } from "@/components/ui/metric";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { applications, clients, reps as repsTable } from "@/db/schema/app";
import { bucketByDay, chartColorForClient } from "@/lib/charts";
import { getClientReport } from "@/lib/clients/report";
import { cents } from "@/lib/money";
import { displayName } from "@/lib/text";
import { rosterClientBySlug } from "@/lib/roster-server";
import {
  aggregateByRep,
  compareRepStats,
  dispositionLabel,
  summarizeActivity,
} from "@/lib/sales/call-activity";
import { listCallLogs } from "@/lib/sales/call-queries";
import { listDeals } from "@/lib/sales/queries";
import { refreshProviderOnView } from "@/lib/integrations/refresh-on-view";

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
  // Live when you're looking: kick a close pull after the response.
  refreshProviderOnView("close");
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
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
  const [portalView, visibility] = await Promise.all([
    isPortalView(),
    portalVisibility(slug),
  ]);
  // Same rule as the workspace home: a client sees MONEY only when the admin
  // turned it on. This tab used to show the cash card unconditionally.
  const showCash = portalShows(portalView, visibility, "cash", false);

  // How the closes paid — from the offer's own deals record.
  let paidMix = null;
  if (showCash && report?.clientId) {
    const snap = await currentSnapshot(report.clientId);
    if (snap) {
      const { deals: dealRows } = await cashRowsForClient(snap.syncId);
      if (dealRows.length > 0) {
        paidMix = closesPaid(
          dealRows.map((d) => ({
            cashCents: d.cashCents,
            revenueCents: d.revenueCents,
            label: d.closeType,
          })),
        );
      }
    }
  }

  const stl = report?.clientId
    ? await offerSpeedToLead(report.clientId)
    : {
        connected: false,
        medianMinutes: null,
        slaPct: null,
        measured: 0,
        applications: 0,
        everDialed: 0,
        byRep: [],
      };
  const color = chartColorForClient(slug);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

  return (
    <div className="space-y-6">
      {/* THE number this floor is judged on: application in → first dial out.
          The 5-minute standard is non-negotiable, so it leads the page. */}
      <section className="card-grad elev-glow rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-faint flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
              <Zap className="size-3.5" /> Speed to lead — the 5-minute standard
            </p>
            {portalView && (!stl.connected || stl.measured === 0) ? (
              // The client's portal never carries GV's setup or ops language
              // ("connect Close", "check the CRM handoff") — those are our
              // jobs. Until the metric measures, the portal says only that.
              <p className="text-muted-foreground mt-2 max-w-xl text-sm">
                Speed-to-lead reporting arrives once the dialler feed is live for this
                offer.
              </p>
            ) : stl.connected &&
              stl.measured === 0 &&
              stl.applications > 0 &&
              stl.everDialed === 0 ? (
              // The operational disconnect, named: applications exist, the
              // floor is dialling — and the two lists never touch.
              <p className="text-warning mt-2 max-w-xl text-sm">
                {stl.applications} application
                {stl.applications === 1 ? "" : "s"} in the last 30 days —{" "}
                <span className="font-medium">none were ever dialled in the CRM</span>.
                The floor&apos;s dials aren&apos;t touching the application list, so
                speed to lead cannot exist yet. Check that applications flow into the
                CRM as leads.
              </p>
            ) : stl.connected ? (
              <div className="mt-2 flex flex-wrap items-end gap-6">
                <div>
                  <p className="numeric text-4xl font-bold tracking-tight">
                    {stl.medianMinutes === null ? "—" : `${stl.medianMinutes}m`}
                  </p>
                  <p className="text-faint text-[11px]">median, last 30 days</p>
                </div>
                <div>
                  <p
                    className={
                      stl.slaPct !== null && stl.slaPct >= 0.8
                        ? "numeric text-success text-4xl font-bold tracking-tight"
                        : "numeric text-warning text-4xl font-bold tracking-tight"
                    }
                  >
                    {stl.slaPct === null ? "—" : `${Math.round(stl.slaPct * 100)}%`}
                  </p>
                  <p className="text-faint text-[11px]">dialled within 5 minutes</p>
                </div>
                <div>
                  <p className="numeric text-4xl font-bold tracking-tight">
                    {stl.measured}
                  </p>
                  <p className="text-faint text-[11px]">applications measured</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground mt-2 max-w-xl text-sm">
                Measured from the dialler&apos;s own record — connect this offer&apos;s
                Close CRM in Integrations and every application is timed to its first
                dial against the 5-minute standard. Nothing is estimated until then.
              </p>
            )}
          </div>
        </div>
        {/* The engine re-cut per rep — attribution to the FIRST dial. GV's
            view only; the floor's per-rep numbers are ours to manage. */}
        {!portalView && stl.byRep.length > 0 && (
          <div className="mt-4 overflow-x-auto border-t pt-3">
            <table className="w-full text-sm">
              <thead className="text-faint text-xs uppercase">
                <tr>
                  <th className="py-1 pr-4 text-left font-medium">Rep — first dial</th>
                  <th className="py-1 pr-4 text-right font-medium">Measured</th>
                  <th className="py-1 pr-4 text-right font-medium">Median</th>
                  <th className="py-1 pr-4 text-right font-medium">Within 5m</th>
                </tr>
              </thead>
              <tbody className="gv-rows">
                {stl.byRep.map((r) => (
                  <tr key={r.rep} className="border-t">
                    <td className="py-1.5 pr-4">{displayName(r.rep)}</td>
                    <td className="numeric py-1.5 pr-4 text-right">{r.matched}</td>
                    <td className="numeric py-1.5 pr-4 text-right">
                      {r.medianMinutes === null ? "—" : `${r.medianMinutes}m`}
                    </td>
                    <td
                      className={
                        r.slaPct !== null && r.slaPct >= 0.8
                          ? "numeric text-success py-1.5 pr-4 text-right"
                          : "numeric text-warning py-1.5 pr-4 text-right"
                      }
                    >
                      {r.slaPct === null ? "—" : `${Math.round(r.slaPct * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showCash && (
          <StatCard
            label="Cash collected — all time"
            value={report ? <Money amount={cents(report.mirror.cashCents)} /> : "—"}
            hint={portalView ? "your offer's collections" : "the mirror's figure"}
            accent={client.accent}
            tone="success"
          />
        )}
        {/* The mirror's own count, not the deals table's. This card sits
            beside "Cash collected — all time", which IS the mirror, and the
            dashboard reports the same pair — a count from one source next to
            cash from another, under one label, is two definitions of the same
            word on two tabs of the same offer. Logged deals still appear in
            the list below, where they are labelled as such. */}
        <StatCard
          label="Deals"
          value={report ? String(report.mirror.deals) : "—"}
          hint="all time, same source as the cash"
          accent={client.accent}
        />
        <StatCard
          label="Show rate"
          value={pct(stats.showRate)}
          hint="from logged calls"
          accent={client.accent}
        />
        <StatCard
          label="Close rate"
          value={pct(stats.closeRate)}
          hint="closes ÷ calls held"
          accent={client.accent}
        />
      </div>

      {showCash && paidMix && (
        <section className="card-grad rounded-xl border p-4">
          <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
            How the closes paid
          </p>
          <div className="text-faint mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="bg-success mr-1.5 inline-block size-2 rounded-full align-middle" />
              <span className="text-foreground font-medium">{paidMix.pif}</span> paid in
              full — $
              {(paidMix.pifCents / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </span>
            <span>
              <span className="bg-brand mr-1.5 inline-block size-2 rounded-full align-middle" />
              <span className="text-foreground font-medium">{paidMix.split}</span> split
              pay — $
              {(paidMix.splitCents / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}{" "}
              collected so far
            </span>
            <span>
              <span
                className="mr-1.5 inline-block size-2 rounded-full align-middle"
                style={{ background: "var(--warning)" }}
              />
              <span className="text-foreground font-medium">{paidMix.deposit}</span>{" "}
              deposit{paidMix.deposit === 1 ? "" : "s"} — $
              {(paidMix.depositCents / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </span>
            {paidMix.unknown > 0 && (
              <span>
                {paidMix.unknown} with no money on the row — unclassified, not guessed
              </span>
            )}
          </div>
        </section>
      )}

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
