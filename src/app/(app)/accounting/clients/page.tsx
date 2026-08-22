import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";
import { cents } from "@/lib/money";
import { roster } from "@/lib/roster";
import { clientLedger } from "@/lib/transactions/ledger";
import { listTransactions } from "@/lib/transactions/queries";

export const metadata = { title: "Client Ledger - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The client/offer ledger (v2 §4): revenue + cash per client, derived from
 * the same backlog as everything else. Attribution is computed at read
 * time; unmatched rows show as their own line, never dropped.
 */
export default async function ClientLedgerPage() {
  const { rows } = await listTransactions({});
  const lines = clientLedger(
    rows,
    roster.map((c) => ({ slug: c.slug, name: c.name })),
    matchesSheetClient,
  );
  const attributed = lines.filter((l) => l.slug !== null);
  const totalCash = lines.reduce((s, l) => s + l.cashCents, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Client"
        highlight="ledger."
        description="Revenue and cash per client, read straight off the transactions backlog. Sheet rows attribute by the tested name aliases; processor rows carry their client directly. Rep commissions live in each offer's sales module, not here."
        status={
          <StatusPill tone={attributed.length ? "live" : "muted"}>
            {attributed.length} clients with money
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Cash across clients"
          value={<Money amount={cents(totalCash)} />}
          tone="brand"
        />
        <Kpi label="Attributed lines" value={String(attributed.length)} />
        <Kpi
          label="Unattributed cash"
          value={
            <Money
              amount={cents(
                lines
                  .filter((l) => l.slug === null)
                  .reduce((s, l) => s + l.cashCents, 0),
              )}
            />
          }
        />
      </div>

      {lines.length === 0 ? (
        <Panel title="No income yet">
          <p className="text-faint py-8 text-center text-sm">
            The backlog has no income rows — the ledger fills as deals land.
          </p>
        </Panel>
      ) : (
        <Panel title="Per client — largest cash first">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 text-right font-medium">Deals</th>
                <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                <th className="py-2 pr-3 text-right font-medium">Cash</th>
                <th className="py-2 text-right font-medium">After fees</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.slug ?? `name-${l.name}`} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    {l.slug ? (
                      <Link
                        href={`/clients/${l.slug}`}
                        className="hover:text-brand font-medium transition-colors"
                      >
                        {l.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{l.name}</span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                    {l.count}
                  </td>
                  <td className="numeric py-2 pr-3 text-right tabular-nums">
                    <Money amount={cents(l.revenueCents)} />
                  </td>
                  <td className="numeric py-2 pr-3 text-right font-medium tabular-nums">
                    <Money amount={cents(l.cashCents)} />
                  </td>
                  <td className="numeric text-muted-foreground py-2 text-right tabular-nums">
                    <Money amount={cents(l.afterFeesCents)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
