import { EmptyDashboard } from "@/components/shell/empty-dashboard";
import { HomeHeadline, type HomeSection } from "@/components/shell/home-headline";
import { MorningGlance } from "@/components/shell/morning-glance";
import { shellUser } from "@/lib/auth/user";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { getMorningGlance } from "@/lib/dashboard";
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
  homeHeadline,
  homeMonthRows,
  normalizeHomeMode,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

export const metadata = {
  title: "Dashboard - GV OS",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await shellUser();
  const [
    overview,
    compliance,
    closeRatePct,
    settings,
    glance,
    { rows: backlog },
    storedMode,
  ] = await Promise.all([
    getSalesOverview(),
    getEodCompliance(),
    getCloseRatePct(),
    getSettings(),
    getMorningGlance(),
    listTransactions({}),
    getPref<string>(user?.email ?? null, "home-mode"),
  ]);

  const mode = normalizeHomeMode(storedMode);
  const month = dayKeyCT(new Date()).slice(0, 7);
  const headline = homeHeadline(backlog, mode, month);

  // Sections: only who actually has money this month, in the current mode.
  const monthRows = homeMonthRows(backlog, mode, month);
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

  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Chicago",
  });

  return (
    <div className="space-y-6">
      <HomeHeadline
        mode={mode}
        monthLabel={monthLabel}
        collectedCents={headline.collectedCents}
        revenueCents={headline.revenueCents}
        sections={sections}
      />
      <MorningGlance glance={glance} />
      <EmptyDashboard
        stats={{
          cash: overview.cashCollectedCents,
          revenue: overview.revenueCents,
          deals: overview.dealsClosed,
          closeRatePct,
          revenueGoalCents: settings.monthlyRevenueGoalCents,
          applications30d: glance.captures.apps30d,
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
