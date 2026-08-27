import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { revShareRules, transactions } from "@/db/schema/app";
import { cents } from "@/lib/money";
import { getClientReport } from "@/lib/clients/report";
import { revShareLines } from "@/lib/revshare/engine";
import { getAdSpendByMonth } from "@/lib/revshare/ad-spend-query";
import { formatMonth } from "@/lib/revshare/statement";
import { clientBySlug } from "@/lib/roster";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  return {
    title: client ? `${client.name} accounting - GV OS` : "Client accounting - GV OS",
  };
}

/**
 * One client's accounting — the admin view, reachable from Manage. Every figure
 * is DISPLAY ONLY of numbers already computed elsewhere, so it reconciles to the
 * cent with the main accounting:
 *
 *   • Cash / revenue / after-fees / deals  → getClientReport, which runs the
 *     tested clientLedger over the client-layer backlog exactly like
 *     /accounting/clients (the report comment guarantees the agreement).
 *   • Rev-share owed  → revShareLines, the same money-critical engine that feeds
 *     /accounting/revshare, filtered to this client.
 *
 * Nothing here recomputes money or writes to the ledger. The two reads run in
 * separate bursts so the per-request query fan-out stays under the pool law
 * (~8 parallel; see src/db/client.ts).
 */
export default async function ClientAccountingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  // Burst 1: the canonical per-client cash bundle (its own internal fan-out is
  // ≤ 6). mirror.* is the client ledger's line for this offer — identical to the
  // number on /accounting/clients.
  const report = await getClientReport(slug, client.name);

  // Burst 2: the rev-share inputs, read the same way /accounting/revshare reads
  // them, then rated by the shared engine. Two parallel selects + one ad-spend
  // read — well under the pool law.
  const db = getDb();
  const [rules, revShareRows] = await Promise.all([
    db
      .select({
        clientId: revShareRules.clientId,
        rateBps: revShareRules.rateBps,
        effectiveFrom: revShareRules.effectiveFrom,
        deductAdSpend: revShareRules.deductAdSpend,
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
  ]);
  const adSpendByMonth = await getAdSpendByMonth();

  const myLines = report.clientId
    ? revShareLines(revShareRows, rules, adSpendByMonth).filter(
        (l) => l.clientId === report.clientId,
      )
    : [];
  const revShareOwedCents = myLines.reduce((s, l) => s + l.revShareCents, 0);
  const hasRule = report.clientId
    ? rules.some((r) => r.clientId === report.clientId)
    : false;

  // Processor fees for this offer = gross cash − cash after fees. Both figures
  // are taken straight from the same computed ledger line, and afterFees is
  // DEFINED as cash − fees in that ledger, so this is the ledger's own identity
  // shown back — not a re-derivation of money from raw rows.
  const feesCents = report.mirror.cashCents - report.mirror.netCents;
  const { monthlyTargetCents, mtdCashCents } = report.target;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={client.name}
        highlight="accounting."
        avatar={
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-lg border text-base font-bold"
            style={{
              color: client.accent,
              borderColor: `${client.accent}55`,
              background: `${client.accent}14`,
            }}
          >
            {client.name.slice(0, 1)}
          </span>
        }
        status={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone="live">Active client</StatusPill>
            <span className="text-faint text-xs">
              {client.owner} · rev share {client.revShare}
            </span>
          </span>
        }
        description="This client's book — cash collected, fees, and the rev-share GV is owed. Every figure reconciles to the cent with the main accounting; it reads the same computed numbers, never its own."
        actions={
          <Link
            href={`/clients/${slug}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Manage
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cash collected — all time"
          value={<Money amount={cents(report.mirror.cashCents)} />}
          tone="success"
        />
        <Kpi
          label="Cash after fees"
          value={<Money amount={cents(report.mirror.netCents)} />}
        />
        <Kpi
          label="Rev-share owed — GV"
          value={<Money amount={cents(revShareOwedCents)} />}
          tone="brand"
        />
        <Kpi label="Deals" value={String(report.mirror.deals)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* The book — the same breakdown chain the statement uses, scoped to
            this offer's own gross cash. */}
        <Panel title="The book — all time">
          <dl className="space-y-2 text-sm">
            <Line label="Revenue booked" muted>
              <Money amount={cents(report.mirror.revenueCents)} />
            </Line>
            <Line label={`Gross cash collected (${report.mirror.deals} deals)`}>
              <Money amount={cents(report.mirror.cashCents)} />
            </Line>
            <Line label="Processor fees" muted>
              <span className="text-destructive">
                −<Money amount={cents(feesCents)} />
              </span>
            </Line>
            <div className="border-t pt-2">
              <Line label="Cash after fees" strong>
                <Money amount={cents(report.mirror.netCents)} />
              </Line>
            </div>
            <Line label="Rev-share rate" muted>
              {client.revShare}
            </Line>
            <div className="border-t pt-2">
              <Line label="GV rev-share owed" strong>
                <span className="text-success">
                  <Money amount={cents(revShareOwedCents)} />
                </span>
              </Line>
            </div>
          </dl>
          <p className="text-faint mt-4 text-[11px]">
            Cash matches the client ledger; rev-share matches the rev-share ledger —
            both to the cent.
          </p>
        </Panel>

        {/* This month + what's been captured for the offer. */}
        <Panel title="This month">
          <div className="space-y-4">
            <div>
              <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                Cash collected — month to date
              </p>
              <p className="numeric text-success mt-1 text-3xl font-bold tracking-tight">
                <Money amount={cents(mtdCashCents)} />
              </p>
              {monthlyTargetCents !== null && (
                <p className="text-muted-foreground mt-1 text-xs">
                  of <Money amount={cents(monthlyTargetCents)} /> monthly target
                  {monthlyTargetCents > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-foreground font-medium">
                        {Math.round((mtdCashCents / monthlyTargetCents) * 100)}%
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <dl className="space-y-2 border-t pt-4 text-sm">
              <Line label="Payments captured" muted>
                {report.captures.payments}
              </Line>
              <Line label="Signed agreements" muted>
                {report.captures.signedDocs}
              </Line>
              <Line label="Bookings" muted>
                {report.captures.bookings}
              </Line>
            </dl>
          </div>
        </Panel>
      </div>

      {/* Rev-share by month — the exact lines /accounting/revshare shows for
          this client, each linking to the sendable statement. */}
      {myLines.length === 0 ? (
        <Panel title="Rev-share by month">
          <p className="text-faint py-8 text-center text-sm">
            {hasRule
              ? "No client-layer cash captured yet. Rev-share lines appear the moment this offer's collected cash lands from the processor feed."
              : "No rev-share rule is active for this client yet, so nothing is owed. Lock a rate on the rev-share page to start the auto-line."}
          </p>
        </Panel>
      ) : (
        <Panel
          title="Rev-share by month"
          aside={
            <StatusPill tone="progress">
              {myLines.length} pending {myLines.length === 1 ? "line" : "lines"}
            </StatusPill>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 text-right font-medium">Cash after fees</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 pr-3 text-right font-medium">GV rev-share</th>
                  <th className="py-2 text-right font-medium">Statement</th>
                </tr>
              </thead>
              <tbody>
                {myLines.map((l) => (
                  <tr key={l.month} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                      {formatMonth(l.month)}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      <Money amount={cents(l.cashAfterFeesCents)} />
                      {l.adSpendCents > 0 && (
                        <span className="text-destructive block text-[11px]">
                          −<Money amount={cents(l.adSpendCents)} /> ad
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      {(l.rateBps / 100).toFixed(0)}%
                    </td>
                    <td className="numeric py-2 pr-3 text-right font-semibold tabular-nums">
                      <Money amount={cents(l.revShareCents)} />
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/accounting/revshare/statement?client=${slug}&month=${l.month}`}
                        className="text-brand hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-faint text-xs">
        Cash and deals read from the unified transactions backlog through the same
        client ledger as{" "}
        <span className="text-muted-foreground">/accounting/clients</span>; rev-share is
        rated by the same engine as{" "}
        <span className="text-muted-foreground">/accounting/revshare</span>. This page
        computes nothing of its own.
      </p>
    </div>
  );
}

/** One label/value row in the book — mirrors the rev-share statement's Line. */
function Line({
  label,
  children,
  muted,
  strong,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={cn("numeric tabular-nums", strong && "font-semibold")}>
        {children}
      </span>
    </div>
  );
}
