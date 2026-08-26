import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/accounting/print-button";
import { ExportCsv } from "@/components/ui/export-csv";
import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { cents, formatUSD } from "@/lib/money";
import { buildRepPayoutStatement } from "@/lib/payouts/rep-statement";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getPaidRepIds,
  listReps,
  listTeams,
} from "@/lib/sales/queries";

export const metadata = { title: "Payout statement - GV OS" };
export const dynamic = "force-dynamic";

/**
 * A single rep's payout statement — the document GV hands a closer/setter. Every
 * figure is the same one the Commissions table shows: it reuses that rollup and
 * never recomputes commission a second way.
 */
export default async function RepPayoutStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string; basis?: string }>;
}) {
  const { rep: repId, basis: basisParam } = await searchParams;
  const basis = basisParam === "deal_revenue" ? "deal_revenue" : "cash_collected";
  const period = currentPayoutPeriod();

  const [rollup, reps, teams, paid] = await Promise.all([
    getCommissionRollup(basis),
    listReps(),
    listTeams(),
    getPaidRepIds(period),
  ]);

  const line = repId ? rollup.reps.find((r) => r.repId === repId) : undefined;
  const rep = repId ? reps.find((r) => r.id === repId) : undefined;
  const teamName =
    (rep?.clientId && teams.find((t) => t.id === rep.clientId)?.name) || "—";

  const statement =
    line && rep
      ? buildRepPayoutStatement(line, {
          repName: rep.name,
          teamName,
          paid: paid.has(line.repId),
        })
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/sales/commissions"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" /> Commissions
        </Link>
        {statement && (
          <div className="flex items-center gap-2">
            <ExportCsv
              filename={`payout-${statement.repName.toLowerCase().replace(/\s+/g, "-")}.csv`}
              headers={["Line", "Amount"]}
              rows={[
                ["Deals closed", statement.dealCount],
                ["Commission", formatUSD(cents(statement.commissionCents))],
                ["Base", formatUSD(cents(statement.baseCents))],
                ["Bonus", formatUSD(cents(statement.bonusCents))],
                ["Manager skim", formatUSD(cents(statement.skimCents))],
                ["Total owed", formatUSD(cents(statement.totalOwedCents))],
              ]}
            />
            <PrintButton />
          </div>
        )}
      </div>

      {!statement ? (
        <Panel title="No statement">
          <p className="text-faint py-8 text-center text-sm">
            Open a payout statement from the Commissions table — pick a rep.
          </p>
        </Panel>
      ) : (
        <Statement statement={statement} />
      )}
    </div>
  );
}

function Statement({ statement: s }: { statement: RepPayoutStatementView }) {
  return (
    <div className="bg-card space-y-6 rounded-xl border p-8 print:border-0 print:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-brand text-xs font-semibold tracking-wider uppercase">
            Global Ventures
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Payout statement</h1>
        </div>
        <div className="text-right">
          <p className="font-semibold">{s.repName}</p>
          <p className="text-muted-foreground text-sm">
            {ROLE_LABEL[s.role] ?? s.role} · {s.teamName}
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t border-b py-4 text-sm">
        <Line label="Deals closed">{s.dealCount}</Line>
        <Line label="Commission">
          <Money amount={cents(s.commissionCents)} />
        </Line>
        {s.baseCents > 0 && (
          <Line label="Base" muted>
            <Money amount={cents(s.baseCents)} />
          </Line>
        )}
        {s.bonusCents > 0 && (
          <Line label="Bonus" muted>
            <Money amount={cents(s.bonusCents)} />
          </Line>
        )}
        {s.skimCents > 0 && (
          <Line label="Manager skim" muted>
            <Money amount={cents(s.skimCents)} />
          </Line>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            Total owed — to date
          </p>
          <p className="numeric text-success mt-1 text-3xl font-bold">
            <Money amount={cents(s.totalOwedCents)} />
          </p>
        </div>
        <StatusPill tone={s.paid ? "live" : "progress"}>
          {s.paid ? "Paid this period" : "Pending"}
        </StatusPill>
      </div>

      <p className="text-faint text-[11px]">
        Commission is the sum of each deal&apos;s rounded commission on collected cash —
        never a rate on a total. Figures match the GV OS Commissions rollup to the cent.
      </p>
    </div>
  );
}

type RepPayoutStatementView = ReturnType<typeof buildRepPayoutStatement>;

function Line({
  label,
  children,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="numeric tabular-nums">{children}</span>
    </div>
  );
}
