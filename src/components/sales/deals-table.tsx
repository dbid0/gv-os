"use client";

import { motion, useReducedMotion } from "motion/react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusDot, type StatusTone } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/table";
import { type Cents } from "@/lib/money";
import { fadeUp } from "@/lib/motion";

export interface DealRow {
  id: string;
  closedAtISO: string | null;
  customerName: string | null;
  repName: string | null;
  teamName: string | null;
  source: string | null;
  recurrence: string | null;
  revenueCents: Cents;
  cashCollectedCents: Cents;
  status: string;
}

const dash = <span className="text-faint">—</span>;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

export function DealsTable({ rows }: { rows: DealRow[] }) {
  const reduceMotion = useReducedMotion();

  const columns: Column<DealRow>[] = [
    {
      key: "date",
      header: "Date",
      sortBy: (r) => r.closedAtISO ?? "",
      render: (r) => fmtDate(r.closedAtISO),
    },
    { key: "customer", header: "Customer", render: (r) => r.customerName ?? dash },
    { key: "rep", header: "Rep", render: (r) => r.repName ?? dash },
    { key: "team", header: "Team", render: (r) => r.teamName ?? dash },
    { key: "source", header: "Source", render: (r) => r.source ?? dash },
    {
      key: "type",
      header: "Type",
      render: (r) =>
        r.recurrence ? (
          <span className="capitalize">{r.recurrence.replace("_", "-")}</span>
        ) : (
          dash
        ),
    },
    {
      key: "revenue",
      header: "Revenue",
      numeric: true,
      sortBy: (r) => r.revenueCents,
      render: (r) => <Money amount={r.revenueCents} />,
    },
    {
      key: "cash",
      header: "Cash collected",
      numeric: true,
      sortBy: (r) => r.cashCollectedCents,
      render: (r) => <Money amount={r.cashCollectedCents} />,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const tone: StatusTone = r.status === "signed" ? "live" : "pending";
        return (
          <span className="inline-flex items-center gap-2">
            <StatusDot tone={tone} />
            <span className="text-xs capitalize">{r.status}</span>
          </span>
        );
      },
    },
  ];

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
    >
      <Panel
        title="Deals"
        aside={<span className="text-faint text-xs">{rows.length} closed</span>}
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          caption="Closed deals"
        />
      </Panel>
    </motion.div>
  );
}
