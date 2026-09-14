import "server-only";

import { sql } from "drizzle-orm";

import { DashboardCards } from "@/components/shell/dashboard-cards";
import { SalesEngineCard } from "@/components/shell/empty-dashboard";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { normalizeDashboardCards } from "@/lib/dashboard-cards";
import { cents } from "@/lib/money";
import { getPref } from "@/lib/prefs";
import type { RosterClient } from "@/lib/roster";
import type { EodCompliance, SalesOverviewStats } from "@/lib/sales/queries";
import { getSettings } from "@/lib/settings";
import { partialDealAr } from "@/lib/transactions/ar";
import { listTransactions } from "@/lib/transactions/queries";

/**
 * The editable dashboard cards board, streamed behind its own Suspense boundary.
 *
 * This section owns the fetches that NOTHING else on the dashboard needs — the
 * org settings, the card-layout pref, and the raw scalar rollup (pending
 * payouts + Kit subscribers + processor fees, three subqueries in one round
 * trip) — so deferring the board takes all of them off the critical path; the
 * headline + KPI tiles paint without waiting on any of it.
 *
 * The figures shared with the (fast) KPI wall — overview, compliance, close
 * rate, roster — arrive as PROPS from the parent, which already fetched them:
 * those loaders are not request-cached, so re-calling them here would double
 * the query. The backlog re-read (arItems + recent rows) is safe because
 * listTransactions IS request-cached — it resolves from the parent's query.
 * Every number and slot is identical to what the monolithic page rendered.
 */
export async function DashboardCardsSection({
  userEmail,
  roster,
  overview,
  compliance,
  closeRatePct,
}: {
  userEmail: string | null;
  roster: RosterClient[];
  overview: SalesOverviewStats;
  compliance: EodCompliance;
  closeRatePct: number | null;
}) {
  const [settings, storedCards, { rows: backlog }, [scalars]] = await Promise.all([
    getSettings(),
    getPref<unknown>(userEmail, "dashboard-cards"),
    listTransactions({}),
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

  const cards = normalizeDashboardCards(storedCards);
  const arItems = partialDealAr(backlog);
  const arTotalCents = arItems.reduce((t, i) => t + i.arCents, 0);
  const recentRows = backlog.slice(0, 8).map((r) => ({
    id: r.id,
    occurredOn: r.occurredOn,
    direction: r.direction,
    clientName: r.clientName,
    dealType: r.dealType,
    description: r.description,
    cashCents: r.cashCents,
  }));

  return (
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
  );
}
