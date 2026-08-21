import { EmptyDashboard } from "@/components/shell/empty-dashboard";
import { MorningGlance } from "@/components/shell/morning-glance";
import { getMorningGlance } from "@/lib/dashboard";
import {
  getCloseRatePct,
  getEodCompliance,
  getSalesOverview,
} from "@/lib/sales/queries";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Dashboard - GV OS",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [overview, compliance, closeRatePct, settings, glance] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
    getSettings(),
    getMorningGlance(),
  ]);

  return (
    <div className="space-y-6">
      <MorningGlance glance={glance} />
      <EmptyDashboard
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
    </div>
  );
}
