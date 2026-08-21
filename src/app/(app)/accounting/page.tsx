import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Scale,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { ExportCsv } from "@/components/ui/export-csv";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import {
  getLedgerSummary,
  getMonthlyFinance,
  getPartnerPayouts,
  getReceivables,
  listLedgerEvents,
} from "@/lib/accounting";

export const metadata = { title: "Accounting - GV OS" };
export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  payment_received: "Payment",
  processor_fee: "Processor fee",
  payout: "Payout",
  refund: "Refund",
  adjustment: "Adjustment",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default async function AccountingPage() {
  const [summary, months, receivables, partner, events] = await Promise.all([
    getLedgerSummary(),
    getMonthlyFinance(),
    getReceivables(),
    getPartnerPayouts(),
    listLedgerEvents(100),
  ]);

  const ledgerCsv = events.map((e) => [
    new Date(e.occurredAtISO).toLocaleDateString("en-US"),
    EVENT_LABEL[e.eventType] ?? e.eventType,
    e.teamName ?? "",
    e.customerName ?? e.memo ?? e.source,
    (e.amountCents / 100).toFixed(2),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Accounting"
        highlight="ledger."
        description="Every dollar the system has recorded, derived from the append-only ledger — cash in, processor fees, and payouts, netted with no stored balance to drift."
        status={
          <StatusPill tone={summary.eventCount ? "live" : "muted"}>
            {summary.eventCount} {summary.eventCount === 1 ? "event" : "events"}
          </StatusPill>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/accounting/payments"
              className="text-brand hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <Receipt className="size-4" /> Payments
            </Link>
            <Link
              href="/accounting/reconciliation"
              className="text-brand hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <Scale className="size-4" /> Sheet reconciliation
            </Link>
          </div>
        }
      />

      <Panel title="Position">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Cash in"
            icon={ArrowUpRight}
            tone="brand"
            value={<Money amount={summary.cashInCents} />}
          />
          <Kpi
            label="Processor fees"
            icon={Receipt}
            tone="default"
            value={<Money amount={summary.feesCents} />}
          />
          <Kpi
            label="Payouts"
            icon={ArrowDownRight}
            tone="default"
            value={<Money amount={summary.payoutsCents} />}
          />
          <Kpi
            label="Net position"
            icon={Scale}
            tone="brand"
            value={<Money amount={summary.netCents} />}
          />
        </div>
      </Panel>

      {months.length > 0 && (
        <Panel
          title="By month"
          aside={<span className="text-faint text-xs">{months.length} months</span>}
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Month</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cash in</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fees</th>
                  <th className="px-4 py-2.5 text-right font-medium">Payouts</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr
                    key={m.month}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">{m.label}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Money amount={m.cashInCents} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">
                      <Money amount={m.feesCents} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">
                      <Money amount={m.payoutsCents} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      <Money amount={m.netCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Accounts receivable"
        aside={<span className="text-faint text-xs">{receivables.openCount} open</span>}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Kpi
            label="Revenue"
            tone="brand"
            value={<Money amount={receivables.totalRevenueCents} />}
          />
          <Kpi
            label="Collected"
            tone="brand"
            value={<Money amount={receivables.totalCashCents} />}
          />
          <Kpi
            label="Outstanding (AR)"
            value={<Money amount={receivables.totalArCents} />}
          />
        </div>

        {receivables.rows.length === 0 ? (
          <p className="text-muted-foreground mt-5 border-t pt-4 text-sm">
            Everything agreed has been collected — no outstanding balances.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto border-t pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Team</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Collected</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance due</th>
                </tr>
              </thead>
              <tbody>
                {receivables.rows.map((r) => (
                  <tr
                    key={r.dealId}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="px-4 py-2.5">{r.customerName ?? "—"}</td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {r.teamName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money amount={r.revenueCents} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">
                      <Money amount={r.cashCents} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      <Money amount={r.balanceDueCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {partner.rows.length > 0 && (
        <Panel
          title="Partner split"
          aside={<span className="text-faint text-xs">Daniel / Gus · net cash</span>}
        >
          <div className="grid gap-6 sm:grid-cols-3">
            <Kpi
              label="Daniel"
              tone="brand"
              value={<Money amount={partner.danielCents} />}
            />
            <Kpi label="Gus" tone="brand" value={<Money amount={partner.gusCents} />} />
            <Kpi label="Net cash" value={<Money amount={partner.netCents} />} />
          </div>

          {(!partner.hasRules || partner.unresolvedCount > 0) && (
            <div className="text-warning mt-5 flex items-center gap-2 border-t pt-4 text-xs">
              <AlertTriangle className="size-3.5 shrink-0" />
              {!partner.hasRules
                ? "No partner split rule defined yet — net cash can't be split until one exists."
                : `${partner.unresolvedCount} deal${
                    partner.unresolvedCount === 1 ? "" : "s"
                  } have no applicable split rule.`}
            </div>
          )}

          <div className="mt-5 overflow-x-auto border-t pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Team</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net</th>
                  <th className="px-4 py-2.5 text-right font-medium">Daniel</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gus</th>
                </tr>
              </thead>
              <tbody>
                {partner.rows.map((r) => (
                  <tr
                    key={r.dealId}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="px-4 py-2.5">{r.customerName ?? "—"}</td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {r.teamName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money amount={r.netCents} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.unresolved ? (
                        <span className="text-warning text-xs">no rule</span>
                      ) : (
                        <>
                          <Money amount={r.danielCents} />
                          <span className="text-faint ml-1.5 text-xs">
                            {r.danielPct}%
                          </span>
                        </>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right">
                      {r.unresolved ? "—" : <Money amount={r.gusCents} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {events.length === 0 ? (
        <Panel title="No ledger events yet">
          <p className="text-muted-foreground text-sm">
            Every payment, fee, and payout the app records shows here. Log a deal or
            mark a rep paid and the entries appear — nothing is typed twice.
          </p>
        </Panel>
      ) : (
        <Panel
          title="Ledger"
          aside={
            <div className="flex items-center gap-3">
              <span className="text-faint text-xs">{events.length} recent</span>
              <ExportCsv
                filename="gv-os-ledger.csv"
                headers={["Date", "Type", "Team", "Detail", "Amount"]}
                rows={ledgerCsv}
              />
            </div>
          }
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Team</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {fmtDate(e.occurredAtISO)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="bg-secondary rounded-full border px-2.5 py-0.5 text-xs">
                        {EVENT_LABEL[e.eventType] ?? e.eventType}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {e.teamName ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5">
                      {e.customerName ?? e.memo ?? e.source}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money amount={e.amountCents} signed />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
