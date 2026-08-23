"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Gauge,
  History,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { Segmented, type Segment } from "@/components/ui/segmented";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, TableEmpty, type Column } from "@/components/ui/table";
import { cents } from "@/lib/money";
import { fadeUp, stagger } from "@/lib/motion";
import { type PaceStatus } from "@/lib/sales/quota-pacing";
import { cn } from "@/lib/utils";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The Quotas view: RepVision's per-rep and per-team quota assignment, paced.
 *
 * Every figure on screen is real — the target is what was set, the actual is
 * derived from the ledger, deals, and EOD activity, and the pacing is the pure,
 * fully covered math. Rep, Team, and Past are the same rows filtered three ways,
 * so switching tabs never refetches or re-enters the page.
 */

export interface QuotaViewRow {
  id: string;
  scope: "rep" | "team";
  assignee: string;
  assigneeSub: string;
  metricLabel: string;
  isMoney: boolean;
  targetAmount: number;
  actualSoFar: number;
  periodLabel: string;
  status: PaceStatus;
  pacePct: number | null;
  attainmentPct: number;
  isPast: boolean;
}

export interface QuotaSummaryView {
  total: number;
  ahead: number;
  onTrack: number;
  behind: number;
  past: number;
}

const STATUS: Record<PaceStatus, { label: string; tone: StatusTone; bar: string }> = {
  ahead: { label: "Ahead of pace", tone: "good", bar: "bg-success" },
  on_track: { label: "On track", tone: "live", bar: "bg-brand" },
  behind: { label: "Behind pace", tone: "danger", bar: "bg-destructive" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Value({ isMoney, amount }: { isMoney: boolean; amount: number }) {
  return isMoney ? (
    <Money amount={cents(amount)} />
  ) : (
    <span className="numeric">{amount.toLocaleString("en-US")}</span>
  );
}

function Attainment({ row }: { row: QuotaViewRow }) {
  const width = Math.min(100, Math.max(0, Math.round(row.attainmentPct * 100)));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="bg-secondary h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", STATUS[row.status].bar)}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="numeric text-muted-foreground text-xs">
        {pct(row.attainmentPct)}
      </span>
    </div>
  );
}

const CreateButton = (
  <Link
    href="/sales/quotas/new"
    className={cn(buttonVariants({ size: "sm" }), "gap-2")}
  >
    <Plus className="size-3.5" /> Create quota
  </Link>
);

export function QuotasView({
  rows,
  summary,
}: {
  rows: QuotaViewRow[];
  summary: QuotaSummaryView;
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();
  const [tab, setTab] = useState<"rep" | "team" | "past">("rep");

  const filtered = useMemo(() => {
    if (tab === "past") return rows.filter((r) => r.isPast);
    return rows.filter((r) => !r.isPast && r.scope === tab);
  }, [rows, tab]);

  const columns: Column<QuotaViewRow>[] = [
    {
      key: "assignee",
      header: tab === "team" ? "Team" : "Assignee",
      sortBy: (r) => r.assignee,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.assignee}</div>
          <div className="text-faint text-xs">{r.assigneeSub}</div>
        </div>
      ),
    },
    { key: "metric", header: "Metric", render: (r) => r.metricLabel },
    { key: "period", header: "Period", render: (r) => r.periodLabel },
    {
      key: "target",
      header: "Target",
      numeric: true,
      sortBy: (r) => r.targetAmount,
      render: (r) => <Value isMoney={r.isMoney} amount={r.targetAmount} />,
    },
    {
      key: "actual",
      header: tab === "past" ? "Final" : "So far",
      numeric: true,
      sortBy: (r) => r.actualSoFar,
      render: (r) => <Value isMoney={r.isMoney} amount={r.actualSoFar} />,
    },
    {
      key: "attainment",
      header: "Attainment",
      numeric: true,
      sortBy: (r) => r.attainmentPct,
      render: (r) => <Attainment row={r} />,
    },
    {
      key: "status",
      header: tab === "past" ? "Result" : "Pace",
      sortBy: (r) => r.status,
      render: (r) => (
        <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
      ),
    },
  ];

  // The whole feature is empty: an honest, actionable empty state, not zeros.
  if (rows.length === 0) {
    return (
      <motion.div
        initial={reduceMotion || !entrance ? false : "hidden"}
        animate="visible"
        variants={fadeUp}
      >
        <Panel
          title="Quotas"
          aside={<StatusPill tone="pending">No quotas yet</StatusPill>}
        >
          <div className="py-8">
            <TableEmpty
              title="No quotas yet"
              detail="Assign a monthly target to a rep or a team and GV OS paces it against real data — collected cash from the ledger, closed deals, and EOD activity. Nothing here is a guess."
              action={CreateButton}
            />
          </div>
        </Panel>
      </motion.div>
    );
  }

  const emptyFor = (label: string) => (
    <TableEmpty
      title={`No ${label} quotas`}
      detail={
        tab === "past"
          ? "Quotas move here once their month is over."
          : "Create one to start pacing it against real numbers."
      }
      action={tab === "past" ? undefined : CreateButton}
    />
  );

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <Panel title="Quota pacing" aside={CreateButton}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Total quotas"
              value={summary.total.toLocaleString("en-US")}
              icon={Target}
              tone="brand"
            />
            <Kpi
              label="Ahead of pace"
              value={summary.ahead.toLocaleString("en-US")}
              icon={TrendingUp}
              tone="success"
            />
            <Kpi
              label="On track"
              value={summary.onTrack.toLocaleString("en-US")}
              icon={Gauge}
              tone="default"
            />
            <Kpi
              label="Behind pace"
              value={summary.behind.toLocaleString("en-US")}
              icon={TrendingDown}
              tone="danger"
            />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-4">
        <Segmented
          ariaLabel="Quota views"
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          segments={
            [
              { value: "rep", label: "Rep quotas", icon: User },
              { value: "team", label: "Team quotas", icon: Users },
              { value: "past", label: "Past", icon: History },
            ] satisfies Segment[]
          }
        />

        <Panel
          title={
            tab === "past"
              ? "Past quotas"
              : tab === "team"
                ? "Team quotas"
                : "Rep quotas"
          }
          aside={<span className="text-faint text-xs">{filtered.length} shown</span>}
          padded={false}
        >
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(r) => r.id}
            caption="Quotas"
            empty={emptyFor(tab === "past" ? "past" : tab)}
          />
        </Panel>
      </motion.div>
    </motion.div>
  );
}
