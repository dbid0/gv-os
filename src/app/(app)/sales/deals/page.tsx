import { DealsTable, type DealRow } from "@/components/sales/deals-table";
import { SectionScaffold } from "@/components/sales/section-scaffold";
import { SummaryStrip, type OfferBreakdown } from "@/components/sales/summary-strip";
import { Money } from "@/components/ui/metric";
import { cents } from "@/lib/money";
import { compactUsd } from "@/lib/revenue-chart";
import { listDeals } from "@/lib/sales/queries";

export const metadata = {
  title: "Deals - GV OS",
};

export default async function SalesDealsPage() {
  const deals = await listDeals();

  if (deals.length === 0) {
    return (
      <SectionScaffold
        title="Deals"
        waitingOn="the first closed deal"
        columns={[
          "Deal date",
          "Client",
          "Closer",
          "Setter",
          "Program sold",
          "Type of sale",
          "Cash collected",
          "Revenue",
          "Balance due",
          "AR?",
          "Status",
        ]}
        emptyTitle="No deals yet"
        emptyDetail="Closed deals land here from each offer's new-deal form and its payment processor — closer and setter for the split, program sold, cash collected vs. revenue generated, and any balance in AR. Cash is summed from the ledger, never typed twice."
      />
    );
  }

  // Whole-book roll-up, then the per-offer breakdown — the summary Daniel wants
  // on top before the deal-by-deal table. All derived from the fetched rows.
  const totalCash = deals.reduce((s, d) => s + d.cashCollectedCents, 0);
  const totalRevenue = deals.reduce((s, d) => s + d.revenueCents, 0);
  const outstanding = deals.reduce(
    (s, d) => s + Math.max(0, d.revenueCents - d.cashCollectedCents),
    0,
  );

  const byOffer = new Map<string, { count: number; cash: number }>();
  for (const d of deals) {
    const name = d.teamName ?? "Agency";
    const cur = byOffer.get(name) ?? { count: 0, cash: 0 };
    cur.count += 1;
    cur.cash += d.cashCollectedCents;
    byOffer.set(name, cur);
  }
  const perOffer: OfferBreakdown[] = [...byOffer.entries()]
    .sort((a, b) => b[1].cash - a[1].cash)
    .map(([name, v]) => ({
      name,
      detail: `${v.count} ${v.count === 1 ? "deal" : "deals"} · ${compactUsd(v.cash)}`,
    }));

  const rows: DealRow[] = deals.map((d) => ({
    id: d.id,
    closedAtISO: d.closedAt ? d.closedAt.toISOString() : null,
    customerName: d.customerName,
    repName: d.repName,
    teamName: d.teamName,
    source: d.source,
    recurrence: d.recurrence,
    revenueCents: d.revenueCents,
    cashCollectedCents: d.cashCollectedCents,
    status: d.status,
  }));

  return (
    <div className="space-y-6">
      <SummaryStrip
        stats={[
          { label: "Deals closed", value: String(deals.length), tone: "brand" },
          {
            label: "Cash collected",
            value: <Money amount={cents(totalCash)} />,
            tone: "success",
          },
          { label: "Revenue booked", value: <Money amount={cents(totalRevenue)} /> },
          {
            label: "Outstanding (AR)",
            value: <Money amount={cents(outstanding)} />,
            tone: outstanding > 0 ? "warning" : "default",
          },
        ]}
        perOffer={perOffer}
      />
      <DealsTable rows={rows} />
    </div>
  );
}

export const dynamic = "force-dynamic";
