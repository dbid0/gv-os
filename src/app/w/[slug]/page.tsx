import { notFound } from "next/navigation";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { TargetPanel } from "@/components/clients/target-panel";
import { RangePills } from "@/components/shell/home-headline";
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
  homeRangeRows,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

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
  const range = normalizeHomeRange(typeof sp.range === "string" ? sp.range : undefined);
  const bounds = rangeBounds(range, dayKeyCT(new Date()));

  const [report, drive, { rows: backlog }] = await Promise.all([
    getClientReport(slug, client.name),
    getClientDriveAssets(slug),
    listTransactions({}),
  ]);

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
  const appsPerDay = bucketByDay(
    report.apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    new Date(),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
            {bounds.label}
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
        <RangePills active={range} basePath={`/w/${slug}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Applications · 30d" value={String(report.apps30d)} tone="brand" />
        <Kpi
          label="Cash collected (offer)"
          value={<Money amount={cents(report.mirror.cashCents)} />}
          tone="success"
        />
        <Kpi label="Deals" value={String(report.mirror.deals)} />
        <Kpi
          label="Email engine"
          value={
            report.kit
              ? `${report.kit.sequenceCount} seq · ${report.kit.tagCount} tags`
              : "—"
          }
        />
      </div>

      <TargetPanel
        slug={slug}
        monthlyTargetCents={report.target.monthlyTargetCents}
        mtdCashCents={report.target.mtdCashCents}
        monthLabel={new Date().toLocaleDateString("en-US", {
          month: "long",
          timeZone: "America/Chicago",
        })}
      />

      {report.apps30d > 0 && (
        <Panel title="Applications per day — last 30">
          <ColumnChart data={appsPerDay} color={chartColorForClient(client.name)} />
        </Panel>
      )}

      <DriveAssetsPanel slug={slug} drive={drive} />

      <Panel title="Emergency signals">
        <p className="text-faint text-sm">
          Unanswered DMs and leads uncalled past 20 minutes will surface here the moment
          the notification engine (Phase 5) and this offer&apos;s ManyChat + Close
          connections are live. Nothing is being monitored yet — this panel will say so
          loudly when it is.
        </p>
      </Panel>
    </div>
  );
}
