"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  BarChart3,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Percent,
  PhoneCall,
  TrendingUp,
  Users,
} from "lucide-react";
import { type ReactNode } from "react";

import { Kpi, Metric, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { fadeUp, stagger } from "@/lib/motion";
import type { Cents } from "@/lib/money";
import { roster } from "@/lib/roster";

export interface DashboardStats {
  cash: Cents;
  revenue: Cents;
  deals: number;
  closeRatePct: number | null;
  revenueGoalCents: number;
  compliance: {
    submitted: number;
    total: number;
    missing: string[];
    label: string | null;
  };
}

/**
 * The admin sales summary under the headline. Honest by design: a figure
 * with no real data behind it shows a dash and names what it waits on —
 * calls booked and reps light up as bookings and Close connect.
 */

const headline = [
  { label: "Cash collected", icon: CircleDollarSign, tone: "brand" as const },
  { label: "Revenue", icon: TrendingUp, tone: "brand" as const },
  { label: "Deals closed", icon: BarChart3, tone: "brand" as const },
  { label: "Close rate", icon: Percent, tone: "default" as const },
];

const tiles = [
  { label: "Calls booked", waiting: "Bookings connect", icon: PhoneCall },
  { label: "Active reps", waiting: "Close connects", icon: Users },
  { label: "Rev share owed", waiting: "Client-layer cash", icon: CircleDollarSign },
];

export function SalesEngineCard({ stats }: { stats?: DashboardStats }) {
  const reduceMotion = useReducedMotion();

  const kpiValue = (label: string): ReactNode => {
    if (!stats) return undefined;
    if (label === "Cash collected") return <Money amount={stats.cash} />;
    if (label === "Revenue") return <Money amount={stats.revenue} />;
    if (label === "Deals closed") return stats.deals.toLocaleString("en-US");
    return stats.closeRatePct == null ? "—" : `${stats.closeRatePct}%`;
  };

  const compliancePct =
    stats && stats.compliance.total
      ? Math.round((stats.compliance.submitted / stats.compliance.total) * 100)
      : 0;

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="mx-auto w-full max-w-7xl space-y-6"
    >
      <motion.div variants={fadeUp}>
        <Panel
          title="Sales engine"
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
                pending={!stats}
              />
            ))}
          </div>

          {stats && stats.compliance.total > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-4 text-xs">
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <ClipboardCheck className="text-brand size-3.5" /> EOD compliance
                {stats.compliance.label && (
                  <span className="text-faint">({stats.compliance.label})</span>
                )}
              </span>
              <span className="font-medium">{compliancePct}%</span>
              <span className="text-faint">
                {stats.compliance.submitted}/{stats.compliance.total} filed
              </span>
              {stats.compliance.missing.length > 0 && (
                <span className="text-faint">
                  · Missing: {stats.compliance.missing.join(", ")}
                </span>
              )}
            </div>
          )}

          {stats && stats.revenueGoalCents > 0 && (
            <div className="mt-4 space-y-1.5 border-t pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Monthly revenue goal</span>
                <span className="text-faint">
                  <Money amount={stats.revenue} /> of{" "}
                  <Money amount={stats.revenueGoalCents as Cents} />
                </span>
              </div>
              <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-brand h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((stats.revenue / stats.revenueGoalCents) * 100),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
            {roster.map((client) => (
              <Link
                key={client.slug}
                href={`/w/${client.slug}`}
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
    </motion.div>
  );
}

export function WatchTiles() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3"
    >
      {tiles.map((tile) => (
        <motion.div
          key={tile.label}
          variants={fadeUp}
          className="bg-card hover-lift p-5"
        >
          <Metric label={tile.label} pending={tile.waiting} icon={tile.icon} />
        </motion.div>
      ))}
    </motion.div>
  );
}
