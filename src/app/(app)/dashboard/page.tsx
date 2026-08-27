import { sql } from "drizzle-orm";

import { DashboardCards } from "@/components/shell/dashboard-cards";
import { SalesEngineCard } from "@/components/shell/empty-dashboard";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { normalizeDashboardCards } from "@/lib/dashboard-cards";
import { cents } from "@/lib/money";
import { partialDealAr } from "@/lib/transactions/ar";
import { HomeHeadline, type HomeSection } from "@/components/shell/home-headline";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { RepTrendsPanel } from "@/components/shell/rep-trends-panel";
import { SalesMetricsGrid } from "@/components/shell/sales-metrics-grid";
import { TeamsOverviewCard } from "@/components/shell/teams-overview-card";
import { getRepTrends } from "@/lib/sales/rep-trends-query";
import { buildTeamsOverview } from "@/lib/teams-overview";
import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { RevenueChart } from "@/components/ui/revenue-chart";
import { buildActivityHeatmap } from "@/lib/activity-heatmap";
import { shellUser } from "@/lib/auth/user";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { getPref } from "@/lib/prefs";
import { roster } from "@/lib/roster";
import { getSalesMetrics, normalizeSalesMetricIds } from "@/lib/sales/metrics";
import {
  getCloseRatePct,
  getEodCompliance,
  getSalesOverview,
} from "@/lib/sales/queries";
import { getSettings } from "@/lib/settings";
import { clientLedger } from "@/lib/transactions/ledger";
import {
  customBounds,
  homeRangeHeadline,
  homeRangeRows,
  homeRangeSeries,
  normalizeHomeMode,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

export const metadata = {
  title: "Dashboard - GV OS",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await shellUser();
  const todayKey = dayKeyCT(new Date());
  const [
    overview,
    compliance,
    closeRatePct,
    settings,
    { rows: backlog },
    storedMode,
    storedCards,
    salesCatalog,
    storedMetrics,
    repTrends,
    [scalars],
  ] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
    getSettings(),
    listTransactions({}),
    getPref<string>(user?.email ?? null, "home-mode"),
    getPref<unknown>(user?.email ?? null, "dashboard-cards"),
    getSalesMetrics(),
    getPref<unknown>(user?.email ?? null, "sales-metrics"),
    getRepTrends(todayKey),
    getDb().execute<{
      pending_payout_cents: number;
      kit_subscribers: number;
      processor_fees_cents: number;
    }>(sql`
      select
        (coalesce((select sum(base_cents) from app.payouts where status = 'pending'), 0)
         + coalesce((select sum(a.delta_cents) from app.payout_adjustments a
             join app.payouts p on p.id = a.payout_id where p.status = 'pending'), 0))::int
          as pending_payout_cents,
        (select coalesce(sum(latest.subscriber_count), 0) from (
          select distinct on (integration_id) subscriber_count
          from app.kit_snapshots where subscriber_count is not null
          order by integration_id, taken_at desc
        ) latest)::int as kit_subscribers,
        (select coalesce(sum(processor_fee_cents), 0) from app.transactions)::int
          as processor_fees_cents
    `),
  ]);

  const mode = normalizeHomeMode(storedMode);
  const custom =
    params.range === "custom" ? customBounds(params.from, params.to) : null;
  const range = custom
    ? ("custom" as const)
    : normalizeHomeRange(typeof params.range === "string" ? params.range : undefined);
  const bounds =
    custom ?? rangeBounds(range as Exclude<typeof range, "custom">, todayKey);
  const headline = homeRangeHeadline(backlog, mode, bounds);
  const series = homeRangeSeries(backlog, mode, bounds);

  // Sections: only who actually has money in the range, in the current mode.
  const monthRows = homeRangeRows(backlog, mode, bounds);
  const sections: HomeSection[] = clientLedger(
    monthRows,
    roster.map((c) => ({ slug: c.slug, name: c.name })),
    matchesSheetClient,
  )
    .filter((l) => l.cashCents > 0 || l.revenueCents > 0)
    .map((l) => ({
      slug: l.slug,
      name: l.slug ? l.name : "Agency — direct",
      cashCents: l.cashCents,
      revenueCents: l.revenueCents,
    }));

  const recentRows = backlog.slice(0, 8).map((r) => ({
    id: r.id,
    occurredOn: r.occurredOn,
    direction: r.direction,
    clientName: r.clientName,
    dealType: r.dealType,
    description: r.description,
    cashCents: r.cashCents,
  }));

  const cards = normalizeDashboardCards(storedCards);
  const selectedMetricIds = normalizeSalesMetricIds(storedMetrics);
  const arItems = partialDealAr(backlog);
  const arTotalCents = arItems.reduce((t, i) => t + i.arCents, 0);

  // The RepVision "All Teams Overview": headline figures + per-team cash, from
  // client-layer money only (the offer cash), attributed the same way the
  // client ledger does it — so the total equals the sum of the team chips.
  const teamsOverview = buildTeamsOverview(
    clientLedger(
      backlog.filter((r) => r.layer === "client"),
      roster.map((c) => ({ slug: c.slug, name: c.name })),
      matchesSheetClient,
    ),
    overview.dealsClosed,
    closeRatePct,
  );

  const monthLabel =
    range === "month"
      ? new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "America/Chicago",
        })
      : bounds.label;

  return (
    <div className="space-y-6">
      <HomeHeadline
        mode={mode}
        range={range}
        from={bounds.from}
        to={bounds.to}
        todayKey={todayKey}
        monthLabel={monthLabel}
        collectedCents={headline.collectedCents}
        revenueCents={headline.revenueCents}
        sections={sections}
        series={series}
      />

      {/* RepVision's "All Teams Overview": the four headline figures + a
          per-team cash breakdown, folded from client-layer money. */}
      <TeamsOverviewCard overview={teamsOverview} />

      {/* The RepVision-style KPI wall — a metric builder: dense, scannable, and
          add/remove customizable, above the customizable cards. */}
      <SalesMetricsGrid catalog={salesCatalog} selected={selectedMetricIds} />

      {/* Revenue over time — the RepVision chart panel: real $ and date axes,
          gridlines, and a hover crosshair over the daily collected series. */}
      <Panel title="Revenue over time">
        <RevenueChart series={series} />
      </Panel>

      {/* Activity heatmap — the RepVision "Time Period Trends" grid: cash by
          day across the last 13 weeks, darker where more landed. */}
      <Panel title="Cash by day">
        <ActivityHeatmap
          model={buildActivityHeatmap(
            backlog
              .filter((r) => r.direction === "in")
              .map((r) => ({ day: r.occurredOn, value: r.cashCents })),
            todayKey,
            13,
          )}
        />
      </Panel>

      {/* Rep Performance Trends — this window vs the last, per rep, week or
          month, with up/down deltas (RepVision's WoW/MoM panel). */}
      <RepTrendsPanel trends={repTrends} />

      <DashboardCards
        active={cards}
        slots={{
          "sales-engine": (
            <SalesEngineCard
              stats={{
                cash: overview.cashCollectedCents,
                revenue: overview.revenueCents,
                deals: overview.dealsClosed,
                closeRatePct,
                revenueGoalCents: settings.monthlyRevenueGoalCents,
                compliance: {
                  submitted: compliance.submitted,
                  total: compliance.total,
                  missing: compliance.missing,
                  label: compliance.asOf
                    ? compliance.asOf.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : null,
                },
              }}
            />
          ),
          "recent-activity": <RecentTransactions rows={recentRows} />,
          "total-revenue": (
            <Panel title="Total revenue">
              <Kpi
                label="Booked across all offers"
                value={<Money amount={cents(overview.revenueCents)} />}
                tone="brand"
              />
            </Panel>
          ),
          "deals-closed": (
            <Panel title="Deals closed">
              <Kpi
                label="Across all offers"
                value={overview.dealsClosed.toLocaleString("en-US")}
              />
            </Panel>
          ),
          "close-rate": (
            <Panel title="Close rate">
              <Kpi
                label="Closed vs. calls taken"
                value={closeRatePct == null ? "—" : `${closeRatePct}%`}
                tone="brand"
              />
            </Panel>
          ),
          "processor-fees": (
            <Panel title="Processor fees">
              <Kpi
                label="Taken by processors"
                value={<Money amount={cents(scalars?.processor_fees_cents ?? 0)} />}
              />
            </Panel>
          ),
          "ar-owed": (
            <Panel title="Owed to GV">
              <div className="flex items-baseline gap-3">
                <Kpi
                  label={`${arItems.length} open receivables`}
                  value={<Money amount={cents(arTotalCents)} />}
                  tone="brand"
                />
              </div>
            </Panel>
          ),
          "pending-payouts": (
            <Panel title="Pending payouts">
              <Kpi
                label="Unpaid across all months"
                value={<Money amount={cents(scalars?.pending_payout_cents ?? 0)} />}
              />
            </Panel>
          ),
          "kit-subscribers": (
            <Panel title="Email lists">
              <Kpi
                label="Kit subscribers across clients"
                value={(scalars?.kit_subscribers ?? 0).toLocaleString("en-US")}
                tone="brand"
              />
            </Panel>
          ),
        }}
      />
    </div>
  );
}
