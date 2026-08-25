"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { formatUSD, cents } from "@/lib/money";
import {
  trendDelta,
  type RepTrendRow,
  type RepTrends,
  type TrendMetric,
} from "@/lib/sales/rep-trends";
import { cn } from "@/lib/utils";

/**
 * Rep Performance Trends: current window vs the prior one, per rep, with a
 * week/month toggle (RepVision's WoW/MoM). Every metric here reads "up is good"
 * — cash, deals, dials, shows — so a green arrow is always a good sign.
 */

function Delta({ metric }: { metric: TrendMetric }) {
  const d = trendDelta(metric);
  if (d.direction === "flat") return <span className="text-faint text-[11px]">—</span>;
  const up = d.direction === "up";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
        up ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="size-3 shrink-0" />
      {d.pct === null ? "new" : `${Math.abs(d.pct)}%`}
    </span>
  );
}

function Cell({ value, metric }: { value: string; metric: TrendMetric }) {
  return (
    <td className="py-2 pr-3 text-right">
      <div className="flex items-center justify-end gap-2">
        <span className="numeric tabular-nums">{value}</span>
        <Delta metric={metric} />
      </div>
    </td>
  );
}

export function RepTrendsPanel({ trends }: { trends: RepTrends }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const rows: RepTrendRow[] = trends[period];

  const tab = (key: "week" | "month", label: string) => (
    <button
      type="button"
      onClick={() => setPeriod(key)}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs transition-colors",
        period === key
          ? "bg-card text-foreground border-border-strong border font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <Panel
      title="Rep performance trends"
      aside={
        <div className="bg-secondary/60 inline-flex rounded-lg border p-0.5">
          {tab("week", "Week over week")}
          {tab("month", "Month over month")}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-faint py-8 text-center text-sm">
          No rep activity in this window yet — trends fill as EODs and deals land.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Rep</th>
                <th className="py-2 pr-3 text-right font-medium">Cash</th>
                <th className="py-2 pr-3 text-right font-medium">Deals</th>
                <th className="py-2 pr-3 text-right font-medium">Dials</th>
                <th className="py-2 text-right font-medium">Shows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.repId} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <span className="block font-medium">{r.name}</span>
                    {r.teamName && (
                      <span className="text-muted-foreground block text-xs">
                        {r.teamName}
                      </span>
                    )}
                  </td>
                  <Cell
                    value={formatUSD(cents(r.cashCents.current))}
                    metric={r.cashCents}
                  />
                  <Cell value={String(r.deals.current)} metric={r.deals} />
                  <Cell
                    value={r.dials.current.toLocaleString("en-US")}
                    metric={r.dials}
                  />
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="numeric tabular-nums">{r.shows.current}</span>
                      <Delta metric={r.shows} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
