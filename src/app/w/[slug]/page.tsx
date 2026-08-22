import { notFound } from "next/navigation";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { TargetPanel } from "@/components/clients/target-panel";
import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi, Money } from "@/components/ui/metric";
import { bucketByDay, chartColorForClient } from "@/lib/charts";
import { getClientDriveAssets } from "@/lib/clients/drive-assets";
import { getClientReport } from "@/lib/clients/report";
import { cents } from "@/lib/money";
import { clientBySlug } from "@/lib/roster";

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const [report, drive] = await Promise.all([
    getClientReport(slug, client.name),
    getClientDriveAssets(slug),
  ]);
  const appsPerDay = bucketByDay(
    report.apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    new Date(),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
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
    </div>
  );
}
