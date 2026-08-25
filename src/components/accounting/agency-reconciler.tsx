import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { cents } from "@/lib/money";
import type { AgencyReconcileReport } from "@/lib/accounting/reconcile-agency";
import { cn } from "@/lib/utils";

/**
 * The agency book reconciler — GV's own money (setup fees, rev-share GV
 * collects, consulting). Green when every capture is in the book; red when
 * agency processor cash has arrived but isn't recorded yet.
 */
export function AgencyReconciler({ report }: { report: AgencyReconcileReport }) {
  const { rows, driftCount, allGreen, ledgerTotalCents, totalDriftCents } = report;

  return (
    <Panel
      title="Agency book reconciliation"
      aside={
        <StatusPill tone={allGreen ? "live" : "danger"}>
          {allGreen ? "Reconciled" : `${driftCount} drifting`}
        </StatusPill>
      }
    >
      <div
        className={cn(
          "mb-4 flex items-start gap-3 rounded-lg border p-3 text-sm",
          allGreen
            ? "border-success/30 bg-success/5"
            : "border-destructive/40 bg-destructive/5",
        )}
      >
        {allGreen ? (
          <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
        ) : (
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
        )}
        <div>
          <p className="font-medium">
            {allGreen ? (
              <>
                GV&apos;s own book is whole — <Money amount={cents(ledgerTotalCents)} />{" "}
                recorded, nothing pending.
              </>
            ) : (
              `${totalDriftCents === 0 ? "" : (totalDriftCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) + " "}captured but not yet in the agency book.`
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            Setup fees, rev-share GV collects, and consulting (layer = agency). Most is
            entered directly, so the ledger is its own source; a wired processor&apos;s
            unposted capture is the only way this drifts.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-faint py-6 text-center text-sm">
          No agency income recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 text-right font-medium">In the book</th>
                <th className="py-2 pr-3 text-right font-medium">Pending capture</th>
                <th className="py-2 text-right font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-b last:border-0">
                  <td className="text-muted-foreground py-2 pr-3">{r.month}</td>
                  <td className="numeric py-2 pr-3 text-right tabular-nums">
                    <Money amount={cents(r.ledgerCashCents)} />
                  </td>
                  <td
                    className={cn(
                      "numeric py-2 pr-3 text-right tabular-nums",
                      r.driftCents !== 0
                        ? "text-destructive font-medium"
                        : "text-faint",
                    )}
                  >
                    {r.driftCents === 0 ? "—" : <Money amount={cents(r.driftCents)} />}
                  </td>
                  <td className="py-2 text-right">
                    <StatusPill tone={r.status === "drift" ? "danger" : "live"}>
                      {r.status === "drift" ? "Drift" : "OK"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
