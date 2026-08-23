import {
  SalesOverview,
  type SalesOverviewStats,
} from "@/components/sales/sales-overview";
import { getCloseRatePct, getSalesOverview } from "@/lib/sales/queries";

export const metadata = {
  title: "Sales - GV OS",
};

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [overview, closeRatePct] = await Promise.all([
    getSalesOverview(),
    getCloseRatePct(),
  ]);
  const stats: SalesOverviewStats = {
    cashCents: overview.cashCollectedCents,
    revenueCents: overview.revenueCents,
    deals: overview.dealsClosed,
    closeRatePct,
  };
  return <SalesOverview stats={stats} />;
}
