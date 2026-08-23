import Link from "next/link";
import { ArrowRight, Receipt, Scale, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { listTransactions } from "@/lib/transactions/queries";
import { agencyLedger } from "@/lib/transactions/ledger";
import { cents } from "@/lib/money";

export const metadata = { title: "Accounting - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The agency ledger (v2 §4): GV's own book, read straight off the unified
 * transactions backlog. The breakdown chain is the headline — total cash →
 * after fees → after team → net — and every figure below it is the same
 * rows grouped a different way.
 */

const SECTIONS = [
  {
    label: "Transactions backlog",
    href: "/accounting/transactions",
    icon: Receipt,
    detail: "Every dollar, one row — the source of truth",
  },
  {
    label: "Client ledger",
    href: "/accounting/clients",
    icon: Receipt,
    detail: "Revenue and cash per client, same backlog",
  },
  {
    label: "Rev share",
    href: "/accounting/revshare",
    icon: Wallet,
    detail: "The auto-line: client cash after fees × locked rate",
  },
  {
    label: "Payout tracker",
    href: "/accounting/payouts",
    icon: Wallet,
    detail: "Month by month, Pending to Paid — the 50/50 lives here",
  },
  {
    label: "AR & money calendar",
    href: "/accounting/ar",
    icon: Scale,
    detail: "What is owed to GV and what is planned to leave",
  },
  {
    label: "Expenses",
    href: "/accounting/expenses",
    icon: Receipt,
    detail: "GV's own software, tools, and spend",
  },
  {
    label: "Sheet reconciliation",
    href: "/accounting/reconciliation",
    icon: Scale,
    detail: "Penny-exact diff against the Master Finance Sheet",
  },
  {
    label: "Payments inbox",
    href: "/accounting/payments",
    icon: Wallet,
    detail: "Captured processor events awaiting attribution",
  },
];

export default async function AccountingPage() {
  const { rows } = await listTransactions({});
  const ledger = agencyLedger(rows);
  const { chain } = ledger;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Agency"
        highlight="ledger."
        description="GV's own book, derived live from the transactions backlog — nothing stored, nothing entered twice. The chain shows what the agency actually keeps."
        status={
          <StatusPill tone={rows.length ? "live" : "muted"}>
            {rows.length} transactions
          </StatusPill>
        }
      />

      {/* The breakdown chain — identical stages collapse (P0-3): three equal
          numbers in a row read as a bug, so quiet stages merge until money
          actually leaves. */}
      {chain.teamCents === 0 && chain.otherOutCents === 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi
            label="Total cash collected"
            value={<Money amount={cents(chain.totalCashCents)} />}
            tone="brand"
          />
          <Kpi
            label="Processor fees"
            value={<Money amount={cents(chain.processorFeeCents)} />}
          />
          <Kpi
            label="Net after fees — nothing paid out yet"
            value={<Money amount={cents(chain.netCents)} />}
            tone="success"
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Total cash collected"
            value={<Money amount={cents(chain.totalCashCents)} />}
            tone="brand"
          />
          <Kpi
            label={`After fees (−${(chain.processorFeeCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })})`}
            value={<Money amount={cents(chain.afterFeesCents)} />}
          />
          <Kpi
            label={`After team (−${(chain.teamCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })})`}
            value={<Money amount={cents(chain.afterTeamCents)} />}
          />
          <Kpi
            label="Net"
            value={<Money amount={cents(chain.netCents)} />}
            tone="success"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Income by deal type">
          {ledger.byDealType.length === 0 ? (
            <p className="text-faint py-6 text-center text-sm">No income rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-faint border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 text-right font-medium">Deals</th>
                    <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                    <th className="py-2 text-right font-medium">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.byDealType.map((line) => (
                    <tr key={line.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">{line.key}</td>
                      <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                        {line.count}
                      </td>
                      <td className="numeric py-2 pr-3 text-right tabular-nums">
                        <Money amount={cents(line.revenueCents)} />
                      </td>
                      <td className="numeric py-2 text-right font-medium tabular-nums">
                        <Money amount={cents(line.cashCents)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Income by payment method">
          {ledger.byMethod.length === 0 ? (
            <p className="text-faint py-6 text-center text-sm">No income rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-faint border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 text-right font-medium">Deals</th>
                    <th className="py-2 pr-3 text-right font-medium">Cash</th>
                    <th className="py-2 text-right font-medium">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.byMethod.map((line) => (
                    <tr key={line.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">{line.key}</td>
                      <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                        {line.count}
                      </td>
                      <td className="numeric py-2 pr-3 text-right font-medium tabular-nums">
                        <Money amount={cents(line.cashCents)} />
                      </td>
                      <td className="numeric text-muted-foreground py-2 text-right tabular-nums">
                        <Money amount={cents(line.processorFeeCents)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card-grad hover-lift hover:border-brand/40 flex items-start gap-3 rounded-lg border p-4"
          >
            <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-9 shrink-0 place-items-center rounded-lg border">
              <s.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium">
                {s.label} <ArrowRight className="size-3" />
              </span>
              <span className="text-muted-foreground block text-xs">{s.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
