import { SectionScaffold } from "@/components/sales/section-scaffold";

export const metadata = {
  title: "Deals - GV OS",
};

export default function SalesDealsPage() {
  return (
    <SectionScaffold
      title="Deals"
      waitingOn="the deal import"
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
      emptyDetail="Closed deals will appear here once the finance sheet import is wired in. Every row shows its rep, source, and cash collected — derived from the ledger, never typed twice."
    />
  );
}
