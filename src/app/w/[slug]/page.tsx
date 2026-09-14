import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Siren } from "lucide-react";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { CountUpMoney } from "@/components/shell/count-up-money";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { CashGoalStrip } from "@/components/tracking/cash-goal";
import { RightNowPanel } from "@/components/tracking/right-now";
import { LeaderboardBand } from "@/components/tracking/leaderboard-band";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi, Money } from "@/components/ui/metric";
import { bucketByDay, chartColorForClient, dayKeyCT } from "@/lib/charts";
import { ClientLogo } from "@/components/clients/client-logo";
import { getClientDriveAssets } from "@/lib/clients/drive-assets";
import { portalVisibility } from "@/lib/clients/portal-visibility";
import { OfferFunnelPanel } from "@/components/tracking/offer-funnel";
import { FeedFreshness } from "@/components/tracking/feed-freshness";
import { WorkspaceHero } from "@/components/tracking/workspace-hero";
import { refreshTrackingSnapshotsOnView } from "@/lib/integrations/refresh-on-view";
import { snapshotFreshness } from "@/lib/tracking/freshness";
import { loadOfferHome } from "@/lib/tracking/offer-metrics-loader";
import { buildWorkspaceVariants } from "@/lib/tracking/window-money";
import { cents, formatUSD } from "@/lib/money";
import { rosterClientBySlug } from "@/lib/roster-server";
import {
  customBounds,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  return { title: client ? `${client.name} Workspace - GV OS` : "Workspace - GV OS" };
}

/**
 * The workspace dashboard: this client's world only. Command-center sections
 * (Sales / Marketing / Email / CRM) grow here in Phase 4; rev-share and
 * agency figures deliberately do NOT appear — that's Admin's view.
 */
export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  const sp = await searchParams;
  const todayKey = dayKeyCT(new Date());
  const custom = sp.range === "custom" ? customBounds(sp.from, sp.to) : null;
  const range = custom
    ? ("custom" as const)
    : normalizeHomeRange(typeof sp.range === "string" ? sp.range : undefined);
  const bounds =
    custom ?? rangeBounds(range as Exclude<typeof range, "custom">, todayKey);

  const cookieStore = await cookies();
  const portalView = cookieStore.get("gv-dev-role")?.value === "client";

  const [
    {
      metrics,
      report,
      repName,
      mixSource,
      moneySyncedAt,
      funnelSyncedAt,
      recentRows,
      moneyFeed,
      clientRows,
      allTimeCashCents,
      tagSummary,
    },
    drive,
    visibility,
  ] = await Promise.all([
    loadOfferHome(slug, client.name, bounds, todayKey),
    getClientDriveAssets(slug),
    portalVisibility(slug),
  ]);
  if (!report) notFound();
  const funnel = metrics.funnel;

  // Live-when-you're-looking for the money mirror: opening the workspace kicks
  // a Stripe/sheet snapshot pull AFTER the response (throttled), the same way
  // the provider feeds refresh on view. The scheduled */30 pull is still the
  // guaranteed path — this only closes the intraday gap.
  if (report.clientId) refreshTrackingSnapshotsOnView(report.clientId);

  // Snapshot age, computed once on the server so it renders identically after
  // hydration. Money freshness only applies when a snapshot feed owns the
  // headline — a ledger-native offer (no feed) has no snapshot to age.
  const now = new Date();
  const moneyFreshness = mixSource ? snapshotFreshness(moneySyncedAt, now) : null;
  const funnelFreshness = snapshotFreshness(funnelSyncedAt, now);

  // Portal defaults (v2 §6): dashboard-only — apps + assets on, money off
  // until the admin toggles it.
  const show = (key: string, fallback: boolean) =>
    !portalView || (visibility[key] ?? fallback);
  const showCash = show("cash", false);
  const showApps = show("apps", true);
  const showDrive = show("drive", true);

  // Every preset window precomputed once from the payment feed (Stripe/sheet)
  // or, for a feed-less offer, the client-layer ledger — so the hero's range
  // chips switch instantly, client-side, instead of round-tripping per click.
  // The collected cash of each window IS its mix total, so the headline can
  // never disagree with the mix bar beneath it, and never reads $0 while a
  // window has cash.
  const { variants: moneyVariants, custom: customVariant } = buildWorkspaceVariants(
    moneyFeed,
    clientRows,
    todayKey,
    custom,
  );

  // This offer's most recent money — the workspace's own transaction feed.
  const offerRecent = recentRows.map((r) => ({
    id: r.id,
    occurredOn: r.occurredOn,
    direction: r.direction,
    clientName: r.clientName,
    dealType: r.dealType,
    description: r.description,
    cashCents: r.cashCents,
  }));

  const appsPerDay = bucketByDay(
    report.apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    new Date(),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Offer header — the client's world, branded to their accent. The
          Manage link (admin-only) is the way to this offer's data feeds and
          config; owners viewing their own portal never see it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClientLogo slug={slug} name={client.name} accent={client.accent} size={40} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground text-xs">{client.offer}</p>
          </div>
        </div>
        {!portalView && (
          <Link
            href={`/clients/${slug}`}
            className="border-brand/40 text-brand hover:bg-brand-soft/50 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Manage &amp; data feeds <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {showCash && (
        <WorkspaceHero
          slug={slug}
          variants={moneyVariants}
          custom={customVariant}
          initialRange={range}
          todayKey={todayKey}
          mixSource={mixSource}
          moneyFreshness={moneyFreshness}
          allTimeCashCents={allTimeCashCents}
        />
      )}

      {showCash && tagSummary.hiddenCount > 0 && (
        <p className="text-faint -mt-3 text-xs">
          Payment tag rules keep{" "}
          <span className="numeric text-muted-foreground font-medium">
            {formatUSD(cents(tagSummary.hiddenCashCents))}
          </span>{" "}
          across {tagSummary.hiddenCount} payment
          {tagSummary.hiddenCount === 1 ? "" : "s"} out of these figures (whole feed,
          all time).{" "}
          {!portalView && (
            <Link
              href={`/clients/${slug}/setup#tracking-money`}
              className="text-brand hover:underline"
            >
              Review the rules
            </Link>
          )}
        </p>
      )}

      {showCash && (
        <CashGoalStrip
          slug={slug}
          monthlyTargetCents={report.target.monthlyTargetCents}
          mtdCashCents={report.target.mtdCashCents}
          canEdit={!portalView}
        />
      )}

      {showCash && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            variant="tile"
            label="Deals — all time"
            value={String(report.mirror.deals)}
            tone="brand"
          />
          <Kpi
            variant="tile"
            label={`Avg deal size — of ${report.mirror.deals} deals`}
            value={
              report.mirror.deals > 0 ? (
                <Money
                  amount={cents(
                    Math.round(report.mirror.cashCents / report.mirror.deals),
                  )}
                />
              ) : (
                "—"
              )
            }
            tone="brand"
          />
          <Kpi
            variant="tile"
            label="Cash collected — all time"
            value={<CountUpMoney cents={report.mirror.cashCents} />}
            tone="success"
          />
          <Kpi
            variant="tile"
            label="Revenue booked — all time"
            value={<CountUpMoney cents={report.mirror.revenueCents} />}
          />
        </div>
      )}

      {showApps && report.apps30d > 0 && (
        <Panel title="Applications per day — last 30">
          <ColumnChart data={appsPerDay} color={chartColorForClient(client.name)} />
        </Panel>
      )}

      {/* The reference composition: the funnel flow beside the live call
          state. The right column only exists once a calendar reports
          bookings — before that the funnel keeps the full width. */}
      {funnel && funnel.totalLeads > 0 && (
        <div
          className={
            metrics.confirmation.ofBookings > 0
              ? "grid gap-4 lg:grid-cols-[2fr_1fr]"
              : ""
          }
        >
          <Panel
            title="Funnel"
            aside={
              <span className="flex items-center gap-2">
                <span className="text-faint text-xs">from the tracking sheet</span>
                <FeedFreshness freshness={funnelFreshness} />
              </span>
            }
          >
            <OfferFunnelPanel funnel={funnel} slug={slug} />
          </Panel>
          {metrics.confirmation.ofBookings > 0 && (
            <div className="space-y-4">
              <RightNowPanel rightNow={metrics.rightNow} />
              <section className="card-grad rounded-xl border p-4">
                <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                  Confirmed before the call
                </p>
                <p className="text-foreground mt-1 font-mono text-2xl font-semibold tabular-nums">
                  {metrics.confirmation.everConfirmed}
                  <span className="text-muted-foreground text-sm font-normal">
                    {" "}
                    of {metrics.confirmation.ofBookings} booked
                  </span>
                </p>
                {metrics.confirmation.confirmedThenCancelled > 0 && (
                  <p className="text-warning mt-1 text-xs">
                    {metrics.confirmation.confirmedThenCancelled} confirmed, then
                    cancelled anyway
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      <LeaderboardBand metrics={metrics} repName={repName} />

      {showCash && <RecentTransactions rows={offerRecent} />}

      {/* A client sees their files; the folder link itself is GV's setup, so
          the panel is skipped entirely until there is something in it. */}
      {showDrive && (!portalView || drive.folderId) && (
        <DriveAssetsPanel slug={slug} drive={drive} canEdit={!portalView} />
      )}

      {/* Nothing to flag AND nothing wired up is an empty promise on a
          client's page — it stays on GV's own view of the workspace. */}
      {!portalView && (
        <Panel title="Emergency signals">
          <div className="text-faint flex flex-col items-center gap-2 py-6 text-center">
            <Siren className="size-6 opacity-60" />
            <p className="max-w-md text-sm">
              Unanswered DMs and leads uncalled past 20 minutes surface here once this
              offer&apos;s ManyChat + Close feeds connect. Nothing to flag yet.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** The offer's current snapshot and its model — the funnel needs both. */
