"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";

import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/table";
import { type Cents } from "@/lib/money";
import { fadeUp } from "@/lib/motion";

/** One rep's owed line, flattened and serialisable for the client. */
export interface CommissionLine {
  repId: string;
  name: string;
  role: string;
  teamName: string;
  rateBps: number | null;
  deals: number;
  baseCents: Cents;
  commissionCents: Cents;
  bonusCents: Cents;
  skimCents: Cents;
  totalOwedCents: Cents;
}

export interface CommissionSummary {
  cashCollectedCents: Cents;
  revenueCents: Cents;
  commissionCents: Cents;
  skimCents: Cents;
  totalOwedCents: Cents;
  dealsMissingSplits: number;
}

const dash = <span className="text-faint">—</span>;
const pct = (bps: number | null) =>
  bps === null ? dash : `${(bps / 100).toFixed(1)}%`;

export function CommissionsTable({
  lines,
  summary,
}: {
  lines: CommissionLine[];
  summary: CommissionSummary;
}) {
  const reduceMotion = useReducedMotion();

  const columns: Column<CommissionLine>[] = [
    {
      key: "name",
      header: "Participant",
      sortBy: (r) => r.name,
      render: (r) => (
        <span>
          <span className="block text-sm">{r.name}</span>
          <span className="text-muted-foreground block text-xs capitalize">
            {r.role.replace("_", " ")}
          </span>
        </span>
      ),
    },
    { key: "team", header: "Team", render: (r) => r.teamName },
    { key: "rate", header: "%", numeric: true, render: (r) => pct(r.rateBps) },
    {
      key: "deals",
      header: "Deals",
      numeric: true,
      sortBy: (r) => r.deals,
      render: (r) => r.deals || dash,
    },
    {
      key: "base",
      header: "Base",
      numeric: true,
      render: (r) => (r.baseCents ? <Money amount={r.baseCents} /> : dash),
    },
    {
      key: "commission",
      header: "Commission",
      numeric: true,
      sortBy: (r) => r.commissionCents,
      render: (r) => (r.commissionCents ? <Money amount={r.commissionCents} /> : dash),
    },
    {
      key: "bonus",
      header: "Bonus",
      numeric: true,
      render: (r) => (r.bonusCents ? <Money amount={r.bonusCents} /> : dash),
    },
    {
      key: "total",
      header: "Total owed",
      numeric: true,
      sortBy: (r) => r.totalOwedCents,
      render: (r) => <Money amount={r.totalOwedCents} className="font-medium" />,
    },
  ];

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
      className="space-y-6"
    >
      <Panel title="Commissions" aside={<StatusPill tone="live">Live</StatusPill>}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Cash collected"
            value={<Money amount={summary.cashCollectedCents} />}
          />
          <Kpi
            label="Rep commissions"
            value={<Money amount={summary.commissionCents} />}
          />
          <Kpi label="Top-line skim" value={<Money amount={summary.skimCents} />} />
          <Kpi
            label="Total owed"
            value={<Money amount={summary.totalOwedCents} />}
            tone="brand"
          />
        </div>

        {summary.dealsMissingSplits > 0 && (
          <div className="text-warning mt-5 flex items-center gap-2 border-t pt-4 text-xs">
            <AlertTriangle className="size-3.5 shrink-0" />
            {summary.dealsMissingSplits} deal
            {summary.dealsMissingSplits === 1 ? "" : "s"} with no commission split
            {summary.dealsMissingSplits === 1 ? "" : "s"} — paid at the team default.
          </div>
        )}
      </Panel>

      <Panel title="Who gets paid" padded={false}>
        <DataTable
          columns={columns}
          rows={lines}
          getRowKey={(r) => r.repId}
          caption="Commission owed by participant"
        />
      </Panel>
    </motion.div>
  );
}
