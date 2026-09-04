import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { PayoutsPanel, type PayoutRow } from "@/components/accounting/payouts-panel";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { getDb } from "@/db/client";
import { payoutAdjustments, payouts } from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import { cents } from "@/lib/money";
import { partnerSplitCents, payoutTotalCents } from "@/lib/payouts/math";
import { agencyLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";
import { getCommissionRollup } from "@/lib/sales/queries";

export const metadata = { title: "Payouts - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The payout tracker (v2 §4): month-by-month, Pending → Paid. The ONLY
 * place the partner 50/50 appears. Marking paid writes the backlog row —
 * the tracker is workflow, the backlog is money.
 */
export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.month === "string" ? params.month : "";
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : dayKeyCT(new Date()).slice(0, 7);

  const db = getDb();
  const [payoutRows, { rows: backlog }, commissionRollup] = await Promise.all([
    db
      .select()
      .from(payouts)
      .where(eq(payouts.month, month))
      .orderBy(asc(payouts.createdAt)),
    listTransactions({}),
    getCommissionRollup(),
  ]);
  const adjustments = payoutRows.length
    ? await db.select().from(payoutAdjustments)
    : [];

  const rows: PayoutRow[] = payoutRows.map((p) => {
    const mine = adjustments.filter((a) => a.payoutId === p.id);
    return {
      id: p.id,
      kind: p.kind,
      label: p.label,
      baseCents: p.baseCents,
      totalCents: payoutTotalCents(p.baseCents, mine),
      status: p.status,
      adjustments: mine.map((a) => ({
        id: a.id,
        label: a.label,
        deltaCents: a.deltaCents,
      })),
    };
  });

  // The suggestion, not a booking: this month's net split down the middle.
  const chain = agencyLedger(backlog).chain;
  const split = partnerSplitCents(Math.max(0, chain.netCents));

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Payout"
        highlight="tracker."
        description="Month by month, Pending to Paid. Marking paid writes the matching backlog transaction — the tracker is workflow; the backlog stays the money. The 50/50 lives here and nowhere else."
        actions={
          <span className="flex items-center gap-2 text-sm">
            <Link
              href={`/accounting/payouts?month=${prevMonth}`}
              className="text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs transition-colors"
            >
              ← {prevMonth}
            </Link>
            <span className="font-medium">{month}</span>
            <Link
              href={`/accounting/payouts?month=${nextMonth}`}
              className="text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs transition-colors"
            >
              {nextMonth} →
            </Link>
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {/* "Undistributed", not just "net": distributions that have been paid
            are already subtracted out of this figure, which is exactly why the
            monthly run can split the all-time number without ever paying the
            same profit twice. Calling it "Agency net" invited the opposite
            reading — that a full year's profit was about to be drafted again. */}
        <Kpi
          label="Undistributed net (all time)"
          value={<Money amount={cents(chain.netCents)} />}
        />
        <Kpi
          label="Suggested Daniel (50%)"
          value={<Money amount={split.danielCents} />}
          tone="brand"
        />
        <Kpi
          label="Suggested Gus (50%)"
          value={<Money amount={split.gusCents} />}
          tone="brand"
        />
      </div>
      <Panel title="How the run works">
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">Generate {month} run</span>{" "}
            drafts every client&apos;s rev-share receivable and the two 50/50 partner
            distributions (Daniel + Gus) from the net above — penny-exact, and never
            doubled on a re-run. Nothing moves until you mark a row paid, which writes
            the matching backlog transaction.
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-t pt-3">
            <span>
              Rep commissions owed:{" "}
              <span className="text-foreground font-medium">
                <Money amount={cents(commissionRollup.totalOwedCents)} />
              </span>
            </span>
            <Link href="/sales/commissions" className="text-brand hover:underline">
              paid on the Commissions tab →
            </Link>
          </div>
        </div>
      </Panel>

      <PayoutsPanel month={month} rows={rows} />
    </div>
  );
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
