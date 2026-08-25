import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { cents } from "@/lib/money";
import type { ReconcileReport, ReconcileRow } from "@/lib/accounting/reconcile-spine";
import { cn } from "@/lib/utils";

/**
 * The Money Spine reconciler surface — proves, per offer + month, that sources
 * == ledger == rev-share basis. Green when whole; red with the exact delta and
 * reason when not. This is the "can't fail" guarantee made visible.
 */
export function SpineReconciler({ report }: { report: ReconcileReport }) {
  const { rows, driftCount, configCount, allGreen, totalCashDriftCents } = report;

  return (
    <Panel
      title="Money spine reconciliation"
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
            {allGreen
              ? "Every offer's sources, ledger, and rev-share basis agree."
              : `${driftCount} offer-month${driftCount === 1 ? "" : "s"} off by ${(totalCashDriftCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`}
          </p>
          <p className="text-muted-foreground text-xs">
            Sources (processor captures + form) = client-ledger cash = rev-share basis +
            fees.
            {configCount > 0 &&
              ` ${configCount} configuration note${configCount === 1 ? "" : "s"} below.`}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-faint py-6 text-center text-sm">
          No client-layer money yet — offers reconcile as their cash lands.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Offer</th>
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 font-medium">Authority</th>
                <th className="py-2 pr-3 text-right font-medium">Sources</th>
                <th className="py-2 pr-3 text-right font-medium">Ledger</th>
                <th className="py-2 pr-3 text-right font-medium">Δ</th>
                <th className="py-2 text-right font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={`${r.slug}-${r.month}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Row({ r }: { r: ReconcileRow }) {
  const drift = r.status === "drift";
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="py-2 pr-3 font-medium">{r.name}</td>
        <td className="text-muted-foreground py-2 pr-3">{r.month}</td>
        <td className="text-muted-foreground py-2 pr-3 capitalize">{r.authority}</td>
        <td className="numeric py-2 pr-3 text-right tabular-nums">
          <Money amount={cents(r.sourceCashCents)} />
        </td>
        <td className="numeric py-2 pr-3 text-right tabular-nums">
          <Money amount={cents(r.ledgerCashCents)} />
        </td>
        <td
          className={cn(
            "numeric py-2 pr-3 text-right tabular-nums",
            r.cashDeltaCents !== 0 ? "text-destructive font-medium" : "text-faint",
          )}
        >
          {r.cashDeltaCents === 0 ? (
            "—"
          ) : (
            <Money amount={cents(r.cashDeltaCents)} signed />
          )}
        </td>
        <td className="py-2 text-right">
          <StatusPill
            tone={drift ? "danger" : r.status === "config" ? "progress" : "live"}
          >
            {drift ? "Drift" : r.status === "config" ? "Note" : "OK"}
          </StatusPill>
        </td>
      </tr>
      {r.issues.length > 0 && (
        <tr className="border-b last:border-0">
          <td colSpan={7} className="pb-2">
            <ul className="text-muted-foreground ml-1 space-y-0.5 text-xs">
              {r.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className={cn(
                      "mt-1 size-1 shrink-0 rounded-full",
                      drift ? "bg-destructive" : "bg-warning",
                    )}
                  />
                  {issue}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
