import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients, payoutAdjustments, payouts, revShareRules } from "@/db/schema/app";
import { agingTone, daysSinceClose } from "@/lib/accounting/aging";
import { cents } from "@/lib/money";
import { payoutTotalCents } from "@/lib/payouts/math";
import { revShareLines } from "@/lib/revshare/engine";
import {
  moneyCalendar,
  partialDealAr,
  revShareOwed,
  type ArItem,
} from "@/lib/transactions/ar";
import { listTransactions } from "@/lib/transactions/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "AR & Money Calendar - GV OS" };
export const dynamic = "force-dynamic";

/**
 * What is owed and when (v2 §4): partial deals + rev-share owed on one
 * surface, plus the monthly money calendar (owed-in vs planned-out).
 * Everything is computed — the backlog and the payout tracker are the only
 * sources.
 */
export default async function ArPage() {
  const db = getDb();
  const [{ rows: backlog }, rules, clientRows, pendingPayouts, receivedPaid] =
    await Promise.all([
      listTransactions({}),
      db
        .select({
          clientId: revShareRules.clientId,
          rateBps: revShareRules.rateBps,
          effectiveFrom: revShareRules.effectiveFrom,
        })
        .from(revShareRules),
      db.select({ id: clients.id, name: clients.name }).from(clients),
      db.select().from(payouts).where(eq(payouts.status, "pending")),
      db
        .select({
          clientId: payouts.clientId,
          baseCents: payouts.baseCents,
          id: payouts.id,
        })
        .from(payouts)
        .where(and(eq(payouts.status, "paid"), eq(payouts.kind, "revshare_received"))),
    ]);
  const adjustments = pendingPayouts.length
    ? await db.select().from(payoutAdjustments)
    : [];

  // Client-layer rev-share lines (empty until processor cash flows).
  const clientLayerRows = backlog.filter((r) => r.layer === "client");
  const shareLines = revShareLines(
    clientLayerRows.map((r) => ({
      clientId: r.clientId,
      direction: r.direction,
      layer: r.layer,
      occurredOn: r.occurredOn,
      cashCents: r.cashCents,
      processorFeeCents: r.processorFeeCents,
    })),
    rules,
  );
  const nameFor = (id: string) => clientRows.find((c) => c.id === id)?.name ?? "Client";
  const owedRevShare = revShareOwed(
    shareLines.map((l) => ({
      clientId: l.clientId,
      clientName: nameFor(l.clientId),
      month: l.month,
      revShareCents: l.revShareCents,
    })),
    receivedPaid.map((p) => ({ clientId: p.clientId, cashCents: p.baseCents })),
  );

  const partials = partialDealAr(backlog);
  const arItems: ArItem[] = [...partials, ...owedRevShare];
  const totalAr = arItems.reduce((s, i) => s + i.arCents, 0);

  const calendar = moneyCalendar(
    arItems,
    pendingPayouts.map((p) => ({
      month: p.month,
      kind: p.kind,
      totalCents: payoutTotalCents(
        p.baseCents,
        adjustments.filter((a) => a.payoutId === p.id),
      ),
    })),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Owed &"
        highlight="upcoming."
        description="Accounts receivable — partial deals and rev-share owed — plus the money calendar: what should arrive and what is planned to leave, month by month. All computed from the backlog and the payout tracker."
        status={
          <StatusPill tone={arItems.length ? "progress" : "good"}>
            {arItems.length ? `${arItems.length} open items` : "Nothing owed"}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Total owed to GV"
          value={<Money amount={cents(totalAr)} />}
          tone="brand"
        />
        <Kpi
          label="Partial deals"
          value={<Money amount={cents(partials.reduce((s, i) => s + i.arCents, 0))} />}
        />
        <Kpi
          label="Rev-share owed"
          value={
            <Money amount={cents(owedRevShare.reduce((s, i) => s + i.arCents, 0))} />
          }
        />
      </div>

      {calendar.length > 0 && (
        <Panel title="Money calendar — by month">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 text-right font-medium">Owed in</th>
                  <th className="py-2 text-right font-medium">Planned out</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((m) => (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3">{m.month}</td>
                    <td className="numeric text-success py-2 pr-3 text-right font-medium tabular-nums">
                      <Money amount={cents(m.owedInCents)} />
                    </td>
                    <td className="numeric text-destructive py-2 text-right tabular-nums">
                      <Money amount={cents(m.plannedOutCents)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {arItems.length === 0 ? (
        <Panel title="Nothing owed">
          <p className="text-faint py-8 text-center text-sm">
            Every booked dollar is collected and no rev-share is outstanding.
          </p>
        </Panel>
      ) : (
        <Panel title="Open receivables — largest first">
          <div className="space-y-2">
            {arItems
              .sort((a, b) => b.arCents - a.arCents)
              .map((item) => {
                const days = item.aroseOn
                  ? daysSinceClose(item.aroseOn, new Date())
                  : null;
                const tone = agingTone(days);
                return (
                  <div
                    key={`${item.kind}-${item.label}-${item.month}-${item.arCents}`}
                    className="bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3"
                  >
                    <StatusPill tone={item.kind === "revshare" ? "live" : "progress"}>
                      {item.kind === "revshare" ? "Rev-share" : "Partial deal"}
                    </StatusPill>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.label}
                    </span>
                    {days !== null && (
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                          tone === "overdue" && "text-destructive font-semibold",
                          tone === "watch" && "text-warning font-medium",
                          tone === "fresh" && "text-faint",
                        )}
                      >
                        {days}d out
                      </span>
                    )}
                    <span className="numeric text-warning text-sm font-semibold tabular-nums">
                      <Money amount={cents(item.arCents)} /> due
                    </span>
                  </div>
                );
              })}
          </div>
        </Panel>
      )}
    </div>
  );
}
