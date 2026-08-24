import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Siren } from "lucide-react";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { RecentTransactions } from "@/components/shell/recent-transactions";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi, Money } from "@/components/ui/metric";
import { bucketByDay, chartColorForClient, dayKeyCT } from "@/lib/charts";
import { getClientDriveAssets } from "@/lib/clients/drive-assets";
import { getClientReport } from "@/lib/clients/report";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { cents } from "@/lib/money";
import { clientBySlug } from "@/lib/roster";
import {
  customBounds,
  homeRangeRows,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";
import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
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
  const client = clientBySlug(slug);
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

  const [report, drive, { rows: backlog }, visibility] = await Promise.all([
    getClientReport(slug, client.name),
    getClientDriveAssets(slug),
    listTransactions({}),
    portalVisibility(slug),
  ]);
  // Portal defaults (v2 §6): dashboard-only — apps + assets on, money off
  // until the admin toggles it.
  const show = (key: string, fallback: boolean) =>
    !portalView || (visibility[key] ?? fallback);
  const showCash = show("cash", false);
  const showApps = show("apps", true);
  const showDrive = show("drive", true);

  // This client's income inside the range — attributed the same way the
  // client ledger does it (join first, sheet aliases second).
  const rangeRows = homeRangeRows(backlog, "all", bounds).filter(
    (r) =>
      (r.clientName !== null && r.clientName === client.name) ||
      (r.clientName === null &&
        r.description !== null &&
        matchesSheetClient(slug, r.description)),
  );
  const rangeCash = rangeRows.reduce((s, r) => s + r.cashCents, 0);
  const rangeRevenue = rangeRows.reduce((s, r) => s + r.revenueCents, 0);

  // This offer's most recent money, attributed the same way — the workspace's
  // own transaction feed, mirroring the admin dashboard.
  const offerRecent = backlog
    .filter(
      (r) =>
        (r.clientName !== null && r.clientName === client.name) ||
        (r.clientName === null &&
          r.description !== null &&
          matchesSheetClient(slug, r.description)),
    )
    .slice(0, 8)
    .map((r) => ({
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
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-lg border text-sm font-bold"
            style={{
              color: client.accent,
              borderColor: `${client.accent}55`,
              background: `${client.accent}14`,
            }}
          >
            {client.name.slice(0, 1)}
          </span>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* One canonical story (P0-1): never a bare $0.00 sitting above a
              non-zero figure — a quiet range falls back to the all-time
              number with an explicit label. */}
          {rangeCash === 0 && report.mirror.cashCents > 0 ? (
            <div>
              <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                Cash collected — all time
              </p>
              <p className="numeric text-2xl font-bold">
                <Money amount={cents(report.mirror.cashCents)} />{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  nothing collected in {bounds.label.toLowerCase()}
                </span>
              </p>
            </div>
          ) : (
            <div>
              <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                Cash collected — {bounds.label}
              </p>
              <p className="numeric text-2xl font-bold">
                <Money amount={cents(rangeCash)} />{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  collected
                  {rangeRevenue > rangeCash && (
                    <>
                      {" "}
                      of <Money amount={cents(rangeRevenue)} /> booked
                    </>
                  )}
                </span>
              </p>
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
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Deals" value={String(report.mirror.deals)} tone="brand" />
        <Kpi
          label="Cash collected"
          value={<Money amount={cents(report.mirror.cashCents)} />}
          tone="success"
        />
        <Kpi
          label="Revenue generated"
          value={<Money amount={cents(report.mirror.revenueCents)} />}
        />
      </div>

      {showApps && report.apps30d > 0 && (
        <Panel title="Applications per day — last 30">
          <ColumnChart data={appsPerDay} color={chartColorForClient(client.name)} />
        </Panel>
      )}

      {showCash && <RecentTransactions rows={offerRecent} />}

      {showDrive && <DriveAssetsPanel slug={slug} drive={drive} />}

      <Panel title="Emergency signals">
        <div className="text-faint flex flex-col items-center gap-2 py-6 text-center">
          <Siren className="size-6 opacity-60" />
          <p className="max-w-md text-sm">
            Unanswered DMs and leads uncalled past 20 minutes surface here once this
            offer&apos;s ManyChat + Close feeds connect. Nothing to flag yet.
          </p>
        </div>
      </Panel>
    </div>
  );
}

async function portalVisibility(slug: string): Promise<Record<string, boolean>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ visibility: offerSettings.visibility })
      .from(offerSettings)
      .innerJoin(clients, eq(offerSettings.clientId, clients.id))
      .where(eq(clients.slug, slug))
      .limit(1);
    return row?.visibility ?? {};
  } catch {
    return {};
  }
}
