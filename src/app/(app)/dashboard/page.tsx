import { EmptyDashboard } from "@/components/shell/empty-dashboard";
import {
  getCloseRatePct,
  getEodCompliance,
  getSalesOverview,
} from "@/lib/sales/queries";

export const metadata = {
  title: "Dashboard - GV OS",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [overview, compliance, closeRatePct] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
  ]);

  return (
    <EmptyDashboard
      stats={{
        cash: overview.cashCollectedCents,
        revenue: overview.revenueCents,
        deals: overview.dealsClosed,
        closeRatePct,
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
  );
}
