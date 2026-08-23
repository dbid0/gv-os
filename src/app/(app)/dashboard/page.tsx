import { sql } from "drizzle-orm";

import { DashboardCards } from "@/components/shell/dashboard-cards";
import { SalesEngineCard, WatchTiles } from "@/components/shell/empty-dashboard";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { normalizeDashboardCards } from "@/lib/dashboard-cards";
import { cents } from "@/lib/money";
import { partialDealAr } from "@/lib/transactions/ar";
import { HomeHeadline, type HomeSection } from "@/components/shell/home-headline";
import { shellUser } from "@/lib/auth/user";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { getPref } from "@/lib/prefs";
import { roster } from "@/lib/roster";
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
  const [
    overview,
    compliance,
    closeRatePct,
    settings,
    { rows: backlog },
    storedMode,
    storedCards,
    [scalars],
  ] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
    getSettings(),
    listTransactions({}),
    getPref<string>(user?.email ?? null, "home-mode"),
    getPref<unknown>(user?.email ?? null, "dashboard-cards"),
    getDb().execute<{
      pending_payout_cents: number;
      kit_subscribers: number;
      open_actions: number;
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
        (select count(*) from app.action_items where status <> 'completed')::int
          as open_actions
    `),
  ]);

  const mode = normalizeHomeMode(storedMode);
  const todayKey = dayKeyCT(new Date());
  const custom =
    params.range === "custom" ? customBounds(params.from, params.to) : null;
  const range = custom
    ? ("custom" as const)
    : normalizeHomeRange(typeof params.range === "string" ? params.range : undefined);
  const bounds =
    custom ?? rangeBounds(range as Exclude<typeof range, "custom">, todayKey);
  const headline = homeRangeHeadline(backlog, mode, bounds);

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

  const cards = normalizeDashboardCards(storedCards);
  const arItems = partialDealAr(backlog);
  const arTotalCents = arItems.reduce((t, i) => t + i.arCents, 0);

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
      />
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
          "watch-tiles": <WatchTiles />,
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
          "open-actions": (
            <Panel title="Open actions">
              <Kpi
                label="Team action list"
                value={String(scalars?.open_actions ?? 0)}
              />
            </Panel>
          ),
        }}
      />
    </div>
  );
}
