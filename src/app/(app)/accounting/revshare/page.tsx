import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients, revShareRules, transactions } from "@/db/schema/app";
import { cents } from "@/lib/money";
import { revShareLines } from "@/lib/revshare/engine";
import { eq } from "drizzle-orm";

export const metadata = { title: "Rev Share - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The rev-share auto-line (v2 §4): client-layer cash after fees × the
 * client's effective-dated rate, per month, computed — never hand-entered.
 * Lines are Pending until the payout tracker (next slice) flips them Paid.
 */
export default async function RevSharePage() {
  const db = getDb();
  const [rules, rows, roster] = await Promise.all([
    db
      .select({
        clientId: revShareRules.clientId,
        rateBps: revShareRules.rateBps,
        effectiveFrom: revShareRules.effectiveFrom,
        note: revShareRules.note,
      })
      .from(revShareRules),
    db
      .select({
        clientId: transactions.clientId,
        direction: transactions.direction,
        layer: transactions.layer,
        occurredOn: transactions.occurredOn,
        cashCents: transactions.cashCents,
        processorFeeCents: transactions.processorFeeCents,
      })
      .from(transactions)
      .where(eq(transactions.layer, "client")),
    db.select({ id: clients.id, name: clients.name }).from(clients),
  ]);

  const nameFor = (id: string) => roster.find((c) => c.id === id)?.name ?? "Unknown";
  const lines = revShareLines(rows, rules);
  const pendingTotal = lines.reduce((s, l) => s + l.revShareCents, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Rev"
        highlight="share."
        description="The auto-line: each client's cash after processing fees × their locked rate, computed per month from the backlog. Rep commissions never enter this number. Pending flips to Paid in the payout tracker."
        status={
          <StatusPill tone={lines.length ? "live" : "muted"}>
            {lines.length} pending {lines.length === 1 ? "line" : "lines"}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Pending rev-share"
          value={<Money amount={cents(pendingTotal)} />}
          tone="brand"
        />
        <Kpi label="Active rules" value={String(rules.length)} />
        <Kpi label="Client-layer rows" value={String(rows.length)} />
      </div>

      <Panel title="Locked rates — effective-dated">
        {rules.length === 0 ? (
          <p className="text-faint py-6 text-center text-sm">No rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={`${r.clientId}-${r.effectiveFrom}`}
                className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {nameFor(r.clientId)}
                </span>
                <span className="numeric text-brand text-sm font-semibold">
                  {(r.rateBps / 100).toFixed(0)}%
                </span>
                <span className="text-faint text-xs">
                  after fees · since {r.effectiveFrom}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-faint mt-3 text-[11px]">
          The Visionary&apos;s 30% activates when the signing is confirmed. Racks&apos;
          10%-after-ad-spend needs the deductions mechanism and is deliberately not a
          flat rule.
        </p>
      </Panel>

      {lines.length === 0 ? (
        <Panel title="No client-layer cash captured yet">
          <p className="text-faint py-8 text-center text-sm">
            Rev-share computes on each offer&apos;s own collected cash, which flows in
            with the processor integrations (Fanbasis webhook, Stripe key). The engine
            is live and rated — the moment client cash lands, lines appear here.
          </p>
        </Panel>
      ) : (
        <Panel title="Pending by client-month">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 text-right font-medium">Cash after fees</th>
                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">GV rev-share</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.clientId}-${l.month}`} className="border-b last:border-0">
                  <td className="text-muted-foreground py-2 pr-3">{l.month}</td>
                  <td className="py-2 pr-3 font-medium">{nameFor(l.clientId)}</td>
                  <td className="numeric py-2 pr-3 text-right tabular-nums">
                    <Money amount={cents(l.cashAfterFeesCents)} />
                  </td>
                  <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                    {(l.rateBps / 100).toFixed(0)}%
                  </td>
                  <td className="numeric py-2 text-right font-semibold tabular-nums">
                    <Money amount={cents(l.revShareCents)} />
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
