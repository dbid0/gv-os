import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { listTransactions, type BacklogFilters } from "@/lib/transactions/queries";
import { ExportCsv } from "@/components/ui/export-csv";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Transactions - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The unified backlog (v2 §2): every dollar, one row, both layers. This page
 * is the raw read; the ledgers and dashboards are filtered views of the same
 * table.
 */

const FILTERS: { label: string; query: string }[] = [
  { label: "All", query: "" },
  { label: "Agency", query: "layer=agency" },
  { label: "Client layer", query: "layer=client" },
  { label: "Money in", query: "direction=in" },
  { label: "Money out", query: "direction=out" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (k: string): string | undefined => {
    const v = params[k];
    return typeof v === "string" && v ? v : undefined;
  };
  const filters: BacklogFilters = {
    layer: pick("layer") as BacklogFilters["layer"],
    direction: pick("direction") as BacklogFilters["direction"],
    from: pick("from"),
    to: pick("to"),
  };
  const { rows, totals } = await listTransactions(filters);
  const activeQuery = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="backlog."
        description="Every dollar in or out, both layers, one row each — appended forever, corrected by reversing rows, never edited."
        status={
          <StatusPill tone={rows.length ? "live" : "muted"}>
            {rows.length} rows
          </StatusPill>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={`/accounting/transactions${f.query ? `?${f.query}` : ""}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              activeQuery === f.query
                ? "border-brand/40 bg-brand-soft/60 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Revenue (filtered)"
          value={<Money amount={cents(totals.revenueCents)} />}
        />
        <Kpi
          label="Cash collected"
          value={<Money amount={cents(totals.cashCents)} />}
          tone="success"
        />
        <Kpi
          label="Processor fees"
          value={<Money amount={cents(totals.processorFeeCents)} />}
        />
      </div>

      {rows.length === 0 ? (
        <Panel title="Nothing here yet">
          <p className="text-faint py-8 text-center text-sm">
            The backlog fills from the sheet import, the new-sale form, and processor
            events — nothing matches this filter yet.
          </p>
        </Panel>
      ) : (
        <Panel
          title="Rows — newest first"
          aside={
            <ExportCsv
              filename="transactions.csv"
              headers={[
                "Date",
                "Layer",
                "Description",
                "Type",
                "Method",
                "Revenue",
                "Cash",
                "Fee",
                "Direction",
                "Source",
              ]}
              rows={rows.map((r) => [
                r.occurredOn,
                r.layer,
                r.clientName ?? r.description ?? "",
                r.dealType ?? "",
                r.paymentMethod ?? "",
                formatUSD(cents(r.revenueCents)),
                formatUSD(cents(r.cashCents)),
                formatUSD(cents(r.processorFeeCents)),
                r.direction,
                r.source,
              ])}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Layer</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="py-2 pr-3 text-right font-medium">Cash</th>
                  <th className="py-2 pr-3 text-right font-medium">Fee</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                      {r.occurredOn}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 text-[11px]",
                          r.layer === "agency"
                            ? "border-brand/30 text-brand"
                            : "text-muted-foreground",
                        )}
                      >
                        {r.layer}
                      </span>
                    </td>
                    <td className="max-w-56 truncate py-2 pr-3">
                      {r.clientName ?? r.description ?? "—"}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {r.dealType ?? "—"}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {r.paymentMethod ?? "—"}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      <Money amount={cents(r.revenueCents)} />
                    </td>
                    <td
                      className={cn(
                        "numeric py-2 pr-3 text-right tabular-nums",
                        r.direction === "out" && "text-destructive",
                      )}
                    >
                      <Money amount={cents(r.cashCents)} />
                    </td>
                    <td className="numeric text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      <Money amount={cents(r.processorFeeCents)} />
                    </td>
                    <td className="text-faint py-2 text-xs">{r.source}</td>
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
