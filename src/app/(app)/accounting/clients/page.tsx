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
  // The GROSS CLIENT side of the book (Daniel's two-tab model): only
  // client-layer rows — the cash each offer collected. Agency-layer income
  // (setup fees, rev-share GV earns FROM a client) lives on the Agency ledger,
  // never here, so a client's gross is never inflated by GV's own cut. The
  // Agency ledger enforces the mirror of this with its own layer filter.
  const { rows } = await listTransactions({ layer: "client" });
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
        description="The gross client side — cash each offer collected, per client. GV's own setup fees and rev-share sit on the Agency ledger, not here."
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
          <div className="overflow-x-auto">
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
                  <tr
                    key={l.slug ?? `name-${l.name}`}
                    className="border-b last:border-0"
                  >
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
          </div>
        </Panel>
      )}
    </div>
  );
}
