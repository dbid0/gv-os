import { SectionScaffold } from "@/components/sales/section-scaffold";

export const metadata = {
  title: "Commissions - GV OS",
};

export default function SalesCommissionsPage() {
  return (
    <SectionScaffold
      title="Commissions"
      waitingOn="the payout rollup"
      columns={[
        "Rep",
        "Role",
        "Team",
        "Rate",
        "Base",
        "Deals",
        "Commission",
        "Bonus",
        "Total owed",
      ]}
      emptyTitle="No payout run yet"
      emptyDetail="Each rep's owed line — commission on collected cash, plus base and bonus, with a manager's top-line skim — will roll up here behind a mark-paid checklist. The engine that computes it is already built and tested to the cent."
    />
  );
}
