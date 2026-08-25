import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";

import { PrintButton } from "@/components/accounting/print-button";
import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients, revShareRules, transactions } from "@/db/schema/app";
import { cents } from "@/lib/money";
import { revShareLines } from "@/lib/revshare/engine";
import { getAdSpendByMonth } from "@/lib/revshare/ad-spend-query";
import { buildRevShareStatement, formatMonth } from "@/lib/revshare/statement";

export const metadata = { title: "Rev-share statement - GV OS" };
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * A single client's monthly rev-share statement — the document GV sends in
 * place of the manual Google Doc. Every figure is the same one the accounting
 * rev-share page shows: cash after fees × the locked rate = GV's share.
 */
export default async function RevShareStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; month?: string }>;
}) {
  const { client: slug, month } = await searchParams;
  const db = getDb();

  const [client] = slug
    ? await db
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(eq(clients.slug, slug))
        .limit(1)
    : [];

  const valid = Boolean(client && month && MONTH_RE.test(month));

  const [rules, rows] = valid
    ? await Promise.all([
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
      ])
    : [[], []];

  const adSpendByMonth = valid ? await getAdSpendByMonth() : new Map<string, number>();
  const line = valid
    ? revShareLines(rows, rules, adSpendByMonth).find(
        (l) => l.clientId === client!.id && l.month === month,
      )
    : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/accounting/revshare"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" /> Rev share
        </Link>
        {line && <PrintButton />}
      </div>

      {!line ? (
        <Panel title="No statement">
          <p className="text-faint py-8 text-center text-sm">
            {valid
              ? `No rev-share recorded for ${client!.name} in ${formatMonth(month!)} yet.`
              : "Open a statement from the rev-share page — pick a client and month."}
          </p>
        </Panel>
      ) : (
        <Statement statement={buildRevShareStatement(rows, line, client!.name)} />
      )}
    </div>
  );
}

function Statement({
  statement: s,
}: {
  statement: ReturnType<typeof buildRevShareStatement>;
}) {
  return (
    <div className="bg-card space-y-6 rounded-xl border p-8 print:border-0 print:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-brand text-xs font-semibold tracking-wider uppercase">
            Global Ventures
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Rev-share statement
          </h1>
        </div>
        <div className="text-right">
          <p className="font-semibold">{s.clientName}</p>
          <p className="text-muted-foreground text-sm">{formatMonth(s.month)}</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-b py-4 text-sm">
        <Line label={`Gross cash collected (${s.dealCount} deals)`}>
          <Money amount={cents(s.grossCashCents)} />
        </Line>
        <Line label="Processor fees" muted>
          <span className="text-destructive">
            −<Money amount={cents(s.processorFeeCents)} />
          </span>
        </Line>
        <Line label="Cash after fees" strong={s.adSpendCents === 0}>
          <Money amount={cents(s.cashAfterFeesCents)} />
        </Line>
        {s.adSpendCents > 0 && (
          <>
            <Line label="Ad spend" muted>
              <span className="text-destructive">
                −<Money amount={cents(s.adSpendCents)} />
              </span>
            </Line>
            <Line label="Rev-share basis" strong>
              <Money amount={cents(s.basisCents)} />
            </Line>
          </>
        )}
        <Line label={`Rev-share rate`} muted>
          {(s.rateBps / 100).toFixed(0)}%
        </Line>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            GV rev-share owed
          </p>
          <p className="numeric text-success mt-1 text-3xl font-bold">
            <Money amount={cents(s.revShareCents)} />
          </p>
        </div>
        <StatusPill tone="progress">Pending</StatusPill>
      </div>

      <p className="text-faint text-[11px]">
        Computed as cash after processing fees × the locked rate. Figures match the GV
        OS rev-share ledger to the cent.
      </p>
    </div>
  );
}

function Line({
  label,
  children,
  muted,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`numeric tabular-nums ${strong ? "font-semibold" : ""}`}>
        {children}
      </span>
    </div>
  );
}
