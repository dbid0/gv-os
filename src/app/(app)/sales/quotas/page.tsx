import {
  QuotasView,
  type QuotaSummaryView,
  type QuotaViewRow,
} from "@/components/sales/quotas-view";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import { listQuotasWithPacing, summarizeQuotas } from "@/lib/sales/quota-queries";

export const metadata = {
  title: "Quotas - GV OS",
};

export const dynamic = "force-dynamic";

/** "2026-08" → "Aug 2026", in UTC so the label matches the period exactly. */
function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SalesQuotasPage() {
  // One clock for the whole read — Date.now() is banned in server components.
  const now = new Date();
  const rows = await listQuotasWithPacing(now.getTime());
  const summary = summarizeQuotas(rows);

  const viewRows: QuotaViewRow[] = rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    assignee:
      r.scope === "team" ? (r.teamName ?? "Team") : (r.repName ?? "Unassigned rep"),
    assigneeSub:
      r.scope === "team"
        ? "Team quota"
        : [ROLE_LABEL[r.repRole ?? ""] ?? r.repRole, r.teamName]
            .filter(Boolean)
            .join(" · "),
    metricLabel: r.metricLabel,
    isMoney: r.isMoney,
    targetAmount: r.targetAmount,
    actualSoFar: r.actualSoFar,
    periodLabel: periodLabel(r.period),
    status: r.pacing.status,
    pacePct: r.pacing.pacePct,
    attainmentPct: r.pacing.attainmentPct,
    isPast: r.isPast,
  }));

  const summaryView: QuotaSummaryView = {
    total: summary.total,
    ahead: summary.ahead,
    onTrack: summary.onTrack,
    behind: summary.behind,
    past: summary.past,
  };

  return <QuotasView rows={viewRows} summary={summaryView} />;
}
