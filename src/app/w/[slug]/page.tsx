import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Siren } from "lucide-react";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { CollectedSparkline } from "@/components/shell/collected-sparkline";
import { CountUpMoney } from "@/components/shell/count-up-money";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RangeChips } from "@/components/ui/range-chips";
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
import { CashMixBar } from "@/components/tracking/cash-mix-bar";
import { PeriodDelta } from "@/components/ui/period-delta";
import { loadOfferHome } from "@/lib/tracking/offer-metrics-loader";
import { cents } from "@/lib/money";
import { rosterClientBySlug } from "@/lib/roster-server";
import {
  customBounds,
  homeRangeSeries,
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
    { metrics, report, repName, mixSource, rangeRows, recentRows },
    drive,
    visibility,
  ] = await Promise.all([
    loadOfferHome(slug, client.name, bounds, todayKey),
    getClientDriveAssets(slug),
    portalVisibility(slug),
  ]);
  if (!report) notFound();
  // Every number below comes from the ONE engine — funnel, mix, and window
  // money are cuts of the same assembled object /sales reads, so the two
  // surfaces can no longer disagree.
  const funnel = metrics.funnel;
  const mix = metrics.cashMix;
  const rangeCash = metrics.money?.rangeCash ?? 0;
  const rangeRevenue = metrics.money?.rangeRevenue ?? 0;
  const prevRangeCash = metrics.money?.prevRangeCash ?? null;

  // Portal defaults (v2 §6): dashboard-only — apps + assets on, money off
  // until the admin toggles it.
  const show = (key: string, fallback: boolean) =>
    !portalView || (visibility[key] ?? fallback);
  const showCash = show("cash", false);
  const showApps = show("apps", true);
  const showDrive = show("drive", true);

  // The offer's own growth curve for the hero — same shape the dashboard uses.
  const offerSeries = homeRangeSeries(rangeRows, "all", bounds);

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
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {/* LEFT — Cash collected: the window's headline with its curve. */}
          <section className="card-grad elev-glow relative rounded-xl border">
            {/* The offer's growth curve behind the number — clipped in its OWN
                rounded layer, NOT on the section, so the date picker's dropdown
                can overflow the card instead of being chopped off. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
              <div className="absolute inset-x-0 bottom-0 h-2/3">
                <CollectedSparkline series={offerSeries} className="h-full w-full" />
              </div>
            </div>
            <div className="relative flex h-full flex-col justify-between gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* One canonical story (P0-1): never a bare $0.00 sitting above
                    a non-zero figure — a quiet range falls back to the all-time
                    number with an explicit label. */}
                {rangeCash === 0 && report.mirror.cashCents > 0 ? (
                  <div>
                    <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                      Cash collected — all time
                    </p>
                    <p className="numeric text-success text-4xl font-bold tracking-tight">
                      <CountUpMoney cents={report.mirror.cashCents} />
                    </p>
                    <p className="text-muted-foreground text-sm">
                      none in the {bounds.label.toLowerCase()}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                      Cash collected — {bounds.label}
                    </p>
                    <p className="numeric text-success text-4xl font-bold tracking-tight">
                      <CountUpMoney cents={rangeCash} />
                    </p>
                    <p className="text-muted-foreground text-sm">
                      collected
                      {rangeRevenue > rangeCash && (
                        <>
                          {" "}
                          · <Money amount={cents(rangeRevenue - rangeCash)} /> still due
                        </>
                      )}
                    </p>
                    <PeriodDelta
                      currentCents={rangeCash}
                      previousCents={prevRangeCash}
                    />
                  </div>
                )}
                <DateRangePicker
                  basePath={`/w/${slug}`}
                  activeRange={range}
                  from={bounds.from}
                  to={bounds.to}
                  todayKey={todayKey}
                />
              </div>
              <RangeChips basePath={`/w/${slug}`} activeRange={range} />
            </div>
          </section>

          {/* RIGHT — Revenue generated: what was SOLD in the window, how it is
              coming in, and whose money it is. Unknown rows stay dashes. */}
          <section className="card-grad rounded-xl border p-5">
            <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
              Revenue generated — {bounds.label}
            </p>
            <p className="numeric text-foreground text-3xl font-bold tracking-tight">
              <CountUpMoney cents={rangeRevenue} />
            </p>
            <PeriodDelta
              currentCents={rangeRevenue}
              previousCents={metrics.money?.prevRangeRevenue ?? null}
            />
            <div className="text-muted-foreground mt-4 space-y-1.5 border-t pt-3 text-sm">
              <p className="flex items-center justify-between gap-3">
                <span>Cash collected</span>
                <span className="numeric text-foreground">
                  <Money amount={cents(rangeCash)} />
                </span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Cash left to collect</span>
                <span className="numeric text-foreground">
                  {rangeRevenue > rangeCash ? (
                    <Money amount={cents(rangeRevenue - rangeCash)} />
                  ) : (
                    "—"
                  )}
                </span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Cash after fees</span>
                {/* Window rows don't carry processor fees yet — a dash, never
                    an estimate. */}
                <span className="numeric">—</span>
              </p>
            </div>
            {mix && (
              <div className="mt-4 border-t pt-3">
                <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                  Cash mix
                  {mixSource && (
                    <span className="text-faint/80 normal-case">
                      {" "}
                      ·{" "}
                      {mixSource === "stripe"
                        ? "via Stripe"
                        : "from the tracking sheet"}
                    </span>
                  )}
                </p>
                <CashMixBar mix={mix} label={bounds.label} />
                {mix.unplaceableCents > 0 && (
                  <p className="text-faint mt-1 text-[11px]">
                    ${(mix.unplaceableCents / 100).toLocaleString("en-US")} without a
                    payer identity — shown, not guessed
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
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
            aside={<span className="text-faint text-xs">from the tracking sheet</span>}
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
