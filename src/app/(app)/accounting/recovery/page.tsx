import { notFound } from "next/navigation";
import { AlertTriangle, RotateCcw, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/empty-state";
import { RecoveryStatusCell } from "@/components/accounting/recovery-status-cell";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { cents } from "@/lib/money";
import { recoverableTotalCents } from "@/lib/payments/recovery";
import { countAutoRecovered, listRecoveryRows } from "@/lib/payments/recovery-store";

export const metadata = { title: "Recovery - GV OS" };
export const dynamic = "force-dynamic";

/**
 * Failed-payment recovery — GV-internal agency ops, admin only. Every declined
 * charge that has not been recovered, richest first, so the biggest dying deal
 * is the first thing a human sees. Capture already refuses to post a failed
 * charge to the ledger; this surface exists purely to CHASE it.
 *
 * Every dollar shown here is attempted-and-declined money — recoverable, never
 * collected. It is never revenue, never cash, and never moves a ledger total.
 */

const fmtWhen = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

export default async function RecoveryPage() {
  // Belt-and-suspenders: the /accounting tree is already admin-only in the
  // route guard, but the page re-checks so a guessable URL never renders.
  if (!(await viewerIsAdmin())) notFound();

  const [rows, autoRecovered] = await Promise.all([
    listRecoveryRows(),
    countAutoRecovered(),
  ]);

  const stillRecoverable = recoverableTotalCents(rows);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Payment"
        highlight="recovery."
        description="Declined and failed charges on closed deals — money a customer's card refused, that nobody is collecting. Every figure here is attempted-and-failed: recoverable, never revenue, never cash, and it never posts to the ledger."
        status={
          <StatusPill tone={rows.length ? "danger" : "good"}>
            {rows.length} to chase
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Still recoverable — attempted, not collected"
          value={<Money amount={cents(stillRecoverable)} />}
          icon={AlertTriangle}
          tone="warning"
        />
        <Kpi label="Failed attempts to chase" value={rows.length} icon={RotateCcw} />
        <Kpi
          label="Auto-recovered — same customer paid later"
          value={autoRecovered}
          icon={TrendingUp}
          tone="success"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No failed charges to chase"
          explainer="Declined charges land here the moment the Stripe pull catches a charge.failed on a connected account. Nothing is invented in the meantime — an empty inbox means every attempted charge either collected or was already resolved."
        />
      ) : (
        <Panel title="Unrecovered failed charges" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Amount</th>
                  <th className="py-2.5 pr-3 font-medium">Offer / client</th>
                  <th className="py-2.5 pr-3 font-medium">Customer</th>
                  <th className="py-2.5 pr-3 font-medium">Failure reason</th>
                  <th className="py-2.5 pr-3 font-medium whitespace-nowrap">
                    First attempt
                  </th>
                  <th className="py-2.5 pr-5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-3 pr-3 pl-5 text-right font-medium tabular-nums">
                      <Money amount={cents(r.amountCents)} />
                    </td>
                    <td className="py-3 pr-3">{r.clientName ?? "Agency"}</td>
                    <td className="text-muted-foreground py-3 pr-3">
                      {r.email ?? "—"}
                    </td>
                    <td className="text-muted-foreground py-3 pr-3 text-xs">
                      {r.failureMessage ?? r.failureCode ?? "—"}
                      {r.failureMessage && r.failureCode ? (
                        <span className="text-faint"> ({r.failureCode})</span>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground py-3 pr-3 whitespace-nowrap">
                      {fmtWhen(r.occurredAt ?? r.createdAt)}
                    </td>
                    <td className="py-3 pr-5">
                      <RecoveryStatusCell
                        paymentEventId={r.id}
                        status={r.effectiveStatus}
                        disposition={r.disposition}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-faint text-xs">
        Setting a status records what you are doing about a declined charge — it never
        retries the card and never moves a money figure. A retry button is deliberately
        out of scope here; this surface only surfaces and tracks.
      </p>
    </div>
  );
}
