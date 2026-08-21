"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusDot, type StatusTone } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/table";
import { type Cents, ZERO, cents, sum } from "@/lib/money";
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
const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

export function DealsTable({ rows }: { rows: DealRow[] }) {
  const reduceMotion = useReducedMotion();
  const [source, setSource] = useState("all");
  const [type, setType] = useState("all");

  const sources = useMemo(
    () =>
      [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (source === "all" || r.source === source) &&
          (type === "all" || (r.recurrence ?? "one_time") === type),
      ),
    [rows, source, type],
  );

  const revenue = sum(filtered.map((r) => r.revenueCents));
  const cash = sum(filtered.map((r) => r.cashCollectedCents));
  const recurring = filtered.filter((r) => r.recurrence === "recurring").length;
  const avgCash = filtered.length ? cents(Math.round(cash / filtered.length)) : ZERO;

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
      className="space-y-6"
    >
      <Panel title="Deals">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Revenue" value={<Money amount={revenue} />} tone="brand" />
          <Kpi label="Cash collected" value={<Money amount={cash} />} tone="brand" />
          <Kpi
            label="Deals"
            value={`${filtered.length}${recurring ? ` · ${recurring} recurring` : ""}`}
          />
          <Kpi label="Avg cash / deal" value={<Money amount={avgCash} />} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          <select
            className={selectClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="one_time">One-time</option>
            <option value="recurring">Recurring</option>
          </select>
          {(source !== "all" || type !== "all") && (
            <span className="text-faint text-xs">
              {filtered.length} of {rows.length}
            </span>
          )}
        </div>
      </Panel>

      <Panel
        title="Closed deals"
        aside={<span className="text-faint text-xs">{filtered.length} shown</span>}
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(r) => r.id}
          caption="Closed deals"
        />
      </Panel>
    </motion.div>
  );
}
