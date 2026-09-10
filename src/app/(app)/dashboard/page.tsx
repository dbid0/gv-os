import { sql } from "drizzle-orm";

import { DashboardCards } from "@/components/shell/dashboard-cards";
import { SalesEngineCard } from "@/components/shell/empty-dashboard";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { normalizeDashboardCards } from "@/lib/dashboard-cards";
import { cents } from "@/lib/money";
import { partialDealAr } from "@/lib/transactions/ar";
import {
  HomeHeadline,
  type HomeSection,
  type HomeVariant,
} from "@/components/shell/home-headline";
import { RevenueOverTime } from "@/components/shell/revenue-over-time";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { RepTrendsPanel } from "@/components/shell/rep-trends-panel";
import { SalesMetricsGrid } from "@/components/shell/sales-metrics-grid";
import { TeamsOverviewCard } from "@/components/shell/teams-overview-card";
import { getRepTrends } from "@/lib/sales/rep-trends-query";
import { buildTeamsOverview } from "@/lib/teams-overview";
import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { buildActivityHeatmap } from "@/lib/activity-heatmap";
import { shellUser } from "@/lib/auth/user";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { getPref } from "@/lib/prefs";
import { loadRoster } from "@/lib/roster-server";
import { normalizeSalesMetricIds, salesMetricsFrom } from "@/lib/sales/metrics";
import {
  closeRateFrom,
  getCommissionRollup,
  getEodCompliance,
  getLeaderboard,
  getSalesOverview,
} from "@/lib/sales/queries";
import { getSettings } from "@/lib/settings";
import { homeSections, totalCard } from "@/lib/home/sections";
import { clientLedger } from "@/lib/transactions/ledger";
import {
  HOME_MODES,
  HOME_RANGES,
  type HomeMode,
  type RangeBounds,
  customBounds,
  homeRangeHeadline,
  homeRangeRows,
  homeRangeSeries,
  normalizeHomeMode,
  normalizeHomeRange,
  previousBounds,
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
  const roster = await loadRoster();
  const params = await searchParams;
  const user = await shellUser();
  const todayKey = dayKeyCT(new Date());
  const [
    overview,
    leaderboard,
    compliance,
    commissionRollup,
    settings,
    { rows: backlog },
    storedMode,
    storedCards,
    storedMetrics,
    repTrends,
    [scalars],
  ] = await Promise.all([
    getSalesOverview(),
    getLeaderboard(),
    getEodCompliance(),
    getCommissionRollup(),
    getSettings(),
    listTransactions({}),
    getPref<string>(user?.email ?? null, "home-mode"),
    getPref<unknown>(user?.email ?? null, "dashboard-cards"),
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

  // Derived from the single leaderboard + overview above — no second fetch.
  // (Previously getCloseRatePct + getSalesMetrics re-ran both queries, so the
  // dashboard scanned deals/moneyEvents/activity 2× each. Same numbers, fewer
  // queries: both are pure functions of the already-fetched rows.)
  const closeRatePct = closeRateFrom(leaderboard);
  // The full metric catalog, derived from rows already fetched above — the
  // overview + leaderboard (never re-queried), plus the commission rollup and
  // EOD compliance the dashboard already loads. The wall renders the user's
  // chosen subset; the "+" picker offers the rest.
  const salesCatalog = salesMetricsFrom(overview, leaderboard, {
    commissionOwedCents: commissionRollup.totalOwedCents,
    eodSubmitted: compliance.submitted,
    eodTotal: compliance.total,
  });

  const mode = normalizeHomeMode(storedMode);
  const custom =
    params.range === "custom" ? customBounds(params.from, params.to) : null;
  const range = custom
    ? ("custom" as const)
    : normalizeHomeRange(typeof params.range === "string" ? params.range : undefined);
  const bounds =
    custom ?? rangeBounds(range as Exclude<typeof range, "custom">, todayKey);
  const headline = homeRangeHeadline(backlog, mode, bounds);
  // The same headline over the window immediately before — "vs last period"
  // context on the hero. All-time has no previous period, so no delta.
  const prevBounds = previousBounds(bounds);
  const prevHeadline = prevBounds ? homeRangeHeadline(backlog, mode, prevBounds) : null;
  const series = homeRangeSeries(backlog, mode, bounds);

  // Sections: only who actually has money in the range — and NEVER a mixed
  // layer on one card. A client card is their OFFER's cash (client layer); a
  // setup fee or rev-share they paid GV is the agency's income and shows on
  // the agency card only. Mixing them reported GV's own collections as
  // revenue the client's offer had made.
  const rosterLite = roster.map((c) => ({ slug: c.slug, name: c.name }));
  const accentBySlug = new Map(roster.map((c) => [c.slug, c.accent]));
  const buildSections = (m: HomeMode, b: RangeBounds): HomeSection[] => {
    let built: HomeSection[];
    if (m === "all") {
      const agency = totalCard(
        clientLedger(
          homeRangeRows(backlog, "agency", b),
          rosterLite,
          matchesSheetClient,
        ),
        "Agency — GV income",
      );
      const clientCards = homeSections(
        clientLedger(
          homeRangeRows(backlog, "clients", b),
          rosterLite,
          matchesSheetClient,
        ),
      );
      built = agency ? [agency, ...clientCards] : clientCards;
    } else {
      // Single-layer modes are already pure; only the slug-less bucket's name
      // differs — GV direct income on the agency book, Unattributed on the
      // client book.
      built = homeSections(
        clientLedger(homeRangeRows(backlog, m, b), rosterLite, matchesSheetClient),
        m === "agency" ? "Agency — direct" : "Unattributed",
      );
    }
    // The client's own colour rides on each card, resolved here from the DB
    // roster — the shell components stopped importing the static file.
    return built.map((s2) => ({
      ...s2,
      accent: s2.slug ? accentBySlug.get(s2.slug) : undefined,
    }));
  };

  // EVERY preset window × scope, precomputed in one pass over the backlog —
  // the hero's toggles are then pure client-side lookups instead of a server
  // action + full refresh per click. 45 variants over a small backlog is
  // cheaper than one network round trip.
  const monthName = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Chicago",
  });
  const variants: Record<string, HomeVariant> = {};
  for (const r of HOME_RANGES) {
    const b = rangeBounds(r, todayKey);
    const pb = previousBounds(b);
    for (const m of HOME_MODES) {
      const h = homeRangeHeadline(backlog, m, b);
      const ph = pb ? homeRangeHeadline(backlog, m, pb) : null;
      variants[`${r}|${m}`] = {
        label: r === "month" ? monthName : b.label,
        from: b.from,
        to: b.to,
        collectedCents: h.collectedCents,
        revenueCents: h.revenueCents,
        previousCollectedCents: ph ? ph.collectedCents : null,
        previousRevenueCents: ph ? ph.revenueCents : null,
        series: homeRangeSeries(backlog, m, b),
        sections: buildSections(m, b),
      };
    }
  }
  const customVariant: HomeVariant | null = custom
    ? {
        label: bounds.label,
        from: bounds.from,
        to: bounds.to,
        collectedCents: headline.collectedCents,
        revenueCents: headline.revenueCents,
        previousCollectedCents: prevHeadline ? prevHeadline.collectedCents : null,
        previousRevenueCents: prevHeadline ? prevHeadline.revenueCents : null,
        series,
        sections: buildSections(mode, bounds),
      }
    : null;
  const seriesByKey = Object.fromEntries(
    Object.entries(variants).map(([k, v]) => [k, v.series]),
  );

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

  return (
    <div className="space-y-6">
      <HomeHeadline
        variants={variants}
        initialMode={mode}
        initialRange={range}
        custom={customVariant}
        todayKey={todayKey}
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
        <RevenueOverTime
          seriesByKey={seriesByKey}
          initialKey={`${range}|${mode}`}
          initialSeries={series}
        />
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
              roster={roster}
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
