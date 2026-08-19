import { DealsTable, type DealRow } from "@/components/sales/deals-table";
import { SectionScaffold } from "@/components/sales/section-scaffold";
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
          "Date",
          "Customer",
          "Rep",
          "Team",
          "Source",
          "Type",
          "Revenue",
          "Cash collected",
          "Status",
        ]}
        emptyTitle="No deals yet"
        emptyDetail="Closed deals appear here. Each row shows its rep, source, and cash collected — the revenue is the agreed value, the cash is summed from the ledger, never typed twice."
      />
    );
  }

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

  return <DealsTable rows={rows} />;
}

export const dynamic = "force-dynamic";
