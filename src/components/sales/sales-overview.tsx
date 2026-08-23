"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  PlugZap,
  Percent,
  TrendingUp,
} from "lucide-react";
import { type ReactNode } from "react";

import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { fadeUp, stagger } from "@/lib/motion";
import type { Cents } from "@/lib/money";
import { roster } from "@/lib/roster";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The Sales overview: the handful of KPIs that move a revenue decision,
 * fed by the same engine as the dashboard. Figures that still wait on a
 * source live in ONE compact connect strip instead of a wall of empty
 * modules (punch-list 14) — the app never looks unfinished twice.
 */

export interface SalesOverviewStats {
  cashCents: Cents;
  revenueCents: Cents;
  deals: number;
  closeRatePct: number | null;
}

const headline = [
  { label: "Cash collected", icon: CircleDollarSign, tone: "brand" as const },
  { label: "Revenue", icon: TrendingUp, tone: "brand" as const },
  { label: "Deals closed", icon: BarChart3, tone: "brand" as const },
  { label: "Close rate", icon: Percent, tone: "default" as const },
];

const waiting = [
  { label: "Applications + calls booked", source: "Sales intake" },
  { label: "Show rate", source: "EOD activity" },
  { label: "Commission owed", source: "Commission entry" },
];

export function SalesOverview({ stats }: { stats: SalesOverviewStats }) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();

  const kpiValue = (label: string): ReactNode => {
    if (label === "Cash collected") return <Money amount={stats.cashCents} />;
    if (label === "Revenue") return <Money amount={stats.revenueCents} />;
    if (label === "Deals closed") return stats.deals.toLocaleString("en-US");
    return stats.closeRatePct == null ? "—" : `${stats.closeRatePct}%`;
  };

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <Panel
          title="All teams"
          aside={
            <span className="text-faint text-xs">{roster.length} active clients</span>
          }
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {headline.map((k) => (
              <Kpi
                key={k.label}
                label={k.label}
                icon={k.icon}
                tone={k.tone}
                value={kpiValue(k.label)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
            {roster.map((client) => (
              <Link
                key={client.slug}
                href={`/w/${client.slug}/sales`}
                className="group border-border-strong bg-secondary/50 hover:border-brand/40 hover:bg-brand-soft/40 text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors"
              >
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: client.accent }}
                />
                {client.name}
                <ChevronRight className="text-faint size-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </Panel>
      </motion.div>

      {/* Everything still waiting on a source, in one strip. */}
      <motion.div variants={fadeUp}>
        <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
            <PlugZap className="text-brand size-3.5" /> Waiting to connect
          </span>
          {waiting.map((w) => (
            <span key={w.label} className="text-faint text-xs">
              {w.label} <span className="text-border-strong">·</span>{" "}
              <span className="text-muted-foreground">{w.source}</span>
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
