import { desc } from "drizzle-orm";

import { ExpenseForm } from "@/components/accounting/expense-form";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { agencyExpenses } from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";
import { cents } from "@/lib/money";

export const metadata = { title: "Expenses - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The agency expense tracker (v2 §2.6). Each entry writes its backlog
 * out-row on the spot, so the ledger chain's "other out" leg and net move
 * with zero extra wiring — this page is just the comfortable way in.
 */
export default async function ExpensesPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(agencyExpenses)
    .orderBy(desc(agencyExpenses.occurredOn))
    .limit(300);

  const thisMonth = dayKeyCT(new Date()).slice(0, 7);
  const monthTotal = rows
    .filter((r) => r.occurredOn.startsWith(thisMonth))
    .reduce((s, r) => s + r.amountCents, 0);
  const allTotal = rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Agency"
        highlight="expenses."
        description="GV's own software, tools, and spend. Recording an expense writes its backlog out-row immediately — the ledger chain and net update on the spot."
        status={
          <StatusPill tone={rows.length ? "live" : "muted"}>
            {rows.length} recorded
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          label={`This month (${thisMonth})`}
          value={<Money amount={cents(monthTotal)} />}
          tone="brand"
        />
        <Kpi label="All time" value={<Money amount={cents(allTotal)} />} />
      </div>

      <Panel title="Record an expense">
        <ExpenseForm today={dayKeyCT(new Date())} />
      </Panel>

      {rows.length === 0 ? (
        <Panel title="No expenses yet">
          <p className="text-faint py-8 text-center text-sm">
            Record the stack — Vercel, tools, contractors — and the agency net gets
            honest.
          </p>
        </Panel>
      ) : (
        <Panel title="Recorded — newest first">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Expense</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                    {r.occurredOn}
                  </td>
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 pr-3">
                    <span className="text-muted-foreground rounded-full border px-1.5 text-[11px]">
                      {r.category}
                    </span>
                  </td>
                  <td className="numeric text-destructive py-2 text-right font-medium tabular-nums">
                    <Money amount={cents(r.amountCents)} />
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
