import { CheckCircle2, TriangleAlert } from "lucide-react";

import { SpineReconciler } from "@/components/accounting/spine-reconciler";
import { getSpineReconciliation } from "@/lib/accounting/reconcile-spine-query";
import { SyncSheetButton } from "@/components/accounting/sync-sheet-button";
import { PageHeader } from "@/components/shell/page-header";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { ColumnChart } from "@/components/ui/column-chart";
import { agingTone, daysSinceClose } from "@/lib/accounting/aging";
import { bucketByMonth } from "@/lib/charts";
import {
  latestReconciliation,
  mirrorMonthly,
  mirrorOutstanding,
} from "@/lib/accounting/sheet-sync";
import { cents } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reconciliation - GV OS" };
export const dynamic = "force-dynamic";

const FIGURES = [
  { key: "feeCents", label: "Fee" },
  { key: "netCents", label: "Net" },
  { key: "danielCents", label: "Daniel" },
  { key: "gusCents", label: "Gus" },
  { key: "arCents", label: "AR" },
] as const;

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

const driftLabel = (cents: number) =>
  `${cents > 0 ? "+" : "−"}${(Math.abs(cents) / 100).toFixed(2)}`;

export default async function ReconciliationPage() {
  const { run, deals } = await latestReconciliation();
  const monthly = bucketByMonth(await mirrorMonthly());
  const outstanding = await mirrorOutstanding();
  const spine = await getSpineReconciliation();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* The Money Spine reconciler leads — the live "can't fail" check that
          sources == ledger == rev-share basis. The sheet mirror follows as the
          transition-period cross-check against the Master Finance Sheet. */}
      <SpineReconciler report={spine} />

      <PageHeader
        title="Sheet"
        highlight="reconciliation."
        description="The Master Finance Sheet stays the system of record. Every sync pulls each deal, recomputes the whole chain — fee, net, Daniel, Gus, AR — with the penny-exact engine, and diffs against the sheet's own figures. Zero drift is the pass."
        status={
          run ? (
            <StatusPill tone={run.driftRowCount === 0 ? "good" : "danger"}>
              {run.driftRowCount === 0
                ? "In agreement"
                : `${run.driftRowCount} ${run.driftRowCount === 1 ? "row drifts" : "rows drift"}`}
            </StatusPill>
          ) : (
            <StatusPill tone="muted">Never synced</StatusPill>
          )
        }
        actions={<SyncSheetButton />}
      />

      {!run ? (
        <Panel title="No sync yet">
          <p className="text-faint py-8 text-center text-sm">
            Run the first sync. GV OS reads the sheet, recomputes every deal, and shows
            any disagreement to the cent. Nothing is written back.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Deals mirrored" value={String(run.rowCount)} />
            <Kpi
              label="Rows with drift"
              value={String(run.driftRowCount)}
              tone={run.driftRowCount === 0 ? "success" : "danger"}
            />
            <Kpi
              label="Total drift"
              value={`$${(run.totalAbsDriftCents / 100).toFixed(2)}`}
              tone={run.totalAbsDriftCents === 0 ? "success" : "danger"}
            />
            <Kpi label="Last sync" value={fmtWhen(run.createdAt)} />
          </div>

          {monthly.length > 0 && (
            <Panel title="Net cash by month — reconciled">
              <ColumnChart data={monthly} unit="cents" />
            </Panel>
          )}

          {outstanding.rows.length > 0 && (
            <Panel
              title={`Outstanding balances — $${(outstanding.totalArCents / 100).toLocaleString("en-US")} owed`}
              aside={(() => {
                const oldest = Math.max(
                  0,
                  ...outstanding.rows.map(
                    (r) => daysSinceClose(r.dateClosed, new Date()) ?? 0,
                  ),
                );
                return oldest > 0 ? (
                  <span className="text-faint text-xs">oldest {oldest} days</span>
                ) : undefined;
              })()}
            >
              <div className="space-y-2">
                {outstanding.rows.map((r) => {
                  const days = daysSinceClose(r.dateClosed, new Date());
                  const tone = agingTone(days);
                  return (
                    <div
                      key={`${r.client}-${r.dateClosed}-${r.arCents}`}
                      className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.client}</p>
                        <p className="text-faint text-[11px]">
                          {r.dealType} · closed {r.dateClosed}
                          {r.notes ? ` · ${r.notes.slice(0, 80)}` : ""}
                        </p>
                      </div>
                      {days !== null && (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                            tone === "overdue" && "text-destructive font-semibold",
                            tone === "watch" && "text-warning font-medium",
                            tone === "fresh" && "text-faint",
                          )}
                        >
                          {days}d out
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs tabular-nums">
                        <Money amount={cents(r.cashCents)} /> of{" "}
                        <Money amount={cents(r.revenueCents)} /> collected
                      </span>
                      <span className="text-warning text-sm font-semibold tabular-nums">
                        <Money amount={cents(r.arCents)} /> due
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel title="Deal-by-deal">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-faint border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 text-right font-medium">Cash</th>
                    <th className="py-2 pr-3 text-right font-medium">Net (ours)</th>
                    <th className="py-2 pr-3 text-right font-medium">Daniel</th>
                    <th className="py-2 pr-3 text-right font-medium">Gus</th>
                    <th className="py-2 font-medium">Agreement</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.rowIndex} className="border-b last:border-0">
                      <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                        {d.dateClosed}
                      </td>
                      <td className="py-2 pr-3">{d.client}</td>
                      <td className="text-muted-foreground py-2 pr-3">{d.dealType}</td>
                      <td className="text-muted-foreground py-2 pr-3">{d.method}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Money amount={cents(d.cashCents)} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Money amount={cents(d.figures.ours.netCents ?? 0)} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Money amount={cents(d.figures.ours.danielCents ?? 0)} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <Money amount={cents(d.figures.ours.gusCents ?? 0)} />
                      </td>
                      <td className="py-2">
                        {d.hasDrift ? (
                          <span className="text-warning inline-flex items-center gap-1 text-xs">
                            <TriangleAlert className="size-3.5" />
                            {FIGURES.filter(
                              (f) => (d.figures.driftCents[f.key] ?? 0) !== 0,
                            )
                              .map(
                                (f) =>
                                  `${f.label} ${driftLabel(d.figures.driftCents[f.key] ?? 0)}`,
                              )
                              .join(" · ")}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-success inline-flex items-center gap-1 text-xs",
                            )}
                          >
                            <CheckCircle2 className="size-3.5" /> To the cent
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <p className="text-faint text-xs">
            Drift is ours − sheet, per figure. A −0.01 on Gus usually means the sheet
            stored an unpayable half-cent split; the engine resolves it as a residual so
            the pair sums exactly to net. Import-only: GV OS never writes to the sheet.
          </p>
        </>
      )}
    </div>
  );
}
