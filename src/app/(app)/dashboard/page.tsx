import { EmptyDashboard } from "@/components/shell/empty-dashboard";
import { HomeHeadline, type HomeSection } from "@/components/shell/home-headline";
import { shellUser } from "@/lib/auth/user";
import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
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
  customBounds,
  homeRangeHeadline,
  homeRangeRows,
  normalizeHomeMode,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

export const metadata = {
  title: "Dashboard - GV OS",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await shellUser();
  const [overview, compliance, closeRatePct, settings, { rows: backlog }, storedMode] =
    await Promise.all([
      getSalesOverview(),
      getEodCompliance(),
      getCloseRatePct(),
      getSettings(),
      listTransactions({}),
      getPref<string>(user?.email ?? null, "home-mode"),
    ]);

  const mode = normalizeHomeMode(storedMode);
  const todayKey = dayKeyCT(new Date());
  const custom =
    params.range === "custom" ? customBounds(params.from, params.to) : null;
  const range = custom
    ? ("custom" as const)
    : normalizeHomeRange(typeof params.range === "string" ? params.range : undefined);
  const bounds =
    custom ?? rangeBounds(range as Exclude<typeof range, "custom">, todayKey);
  const headline = homeRangeHeadline(backlog, mode, bounds);

  // Sections: only who actually has money in the range, in the current mode.
  const monthRows = homeRangeRows(backlog, mode, bounds);
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

  const monthLabel =
    range === "month"
      ? new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "America/Chicago",
        })
      : bounds.label;

  return (
    <div className="space-y-6">
      <HomeHeadline
        mode={mode}
        range={range}
        from={bounds.from}
        to={bounds.to}
        todayKey={todayKey}
        monthLabel={monthLabel}
        collectedCents={headline.collectedCents}
        revenueCents={headline.revenueCents}
        sections={sections}
      />
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
