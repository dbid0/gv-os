import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { cents } from "@/lib/money";

export interface RecentRow {
  id: string;
  occurredOn: string;
  direction: string;
  clientName: string | null;
  dealType: string | null;
  description: string | null;
  cashCents: number;
}

const fmtDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

/**
 * The dashboard's live money feed (Whop's recent-sales pattern, Daniel's ask
 * to see the transaction value). Empty by design until the processor + form
 * feeds connect — it says so plainly rather than faking rows.
 */
export function RecentTransactions({ rows }: { rows: RecentRow[] }) {
  return (
    <Panel title="Recent transactions" padded={rows.length === 0}>
      {rows.length === 0 ? (
        <div className="text-faint flex flex-col items-center gap-2 py-8 text-center">
          <Inbox className="size-6 opacity-60" />
          <p className="text-sm">
            Transactions land here the moment a payment processor or new-deal form
            reports in — every dollar, to the cent.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                    {fmtDay(r.occurredOn)}
                  </td>
                  <td className="py-2 pr-3">
                    {r.clientName ?? r.description ?? "Agency"}
                  </td>
                  <td className="text-faint py-2 pr-3 text-xs">{r.dealType ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    <span
                      className={
                        r.direction === "out" ? "text-warning" : "text-success"
                      }
                    >
                      <span className="mr-1 inline-flex align-middle">
                        {r.direction === "out" ? (
                          <ArrowDownRight className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                      </span>
                      <Money amount={cents(r.cashCents)} />
                    </span>
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
