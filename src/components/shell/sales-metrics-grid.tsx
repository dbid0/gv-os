"use client";

import { motion, useReducedMotion } from "motion/react";
import { BarChart3, DollarSign, Hash, Percent } from "lucide-react";

import type { MetricKind, SalesMetric } from "@/lib/sales/metrics";
import { fadeUp, stagger } from "@/lib/motion";
import { useEntranceOnce } from "@/lib/client-state";
import { cn } from "@/lib/utils";

/**
 * The RepVision-style KPI wall: a dense grid of compact metric tiles, each a
 * small uppercase label, a bold value, and a kind icon in the corner. Money is
 * tinted success, rates brand, counts neutral — so the wall reads at a glance
 * even at this density. Staggers in once (settled on every navigation after).
 */

const KIND_ICON: Record<MetricKind, typeof Hash> = {
  money: DollarSign,
  rate: Percent,
  count: Hash,
};

const KIND_TONE: Record<MetricKind, string> = {
  money: "text-success",
  rate: "text-brand",
  count: "text-foreground",
};

export function SalesMetricsGrid({ metrics }: { metrics: SalesMetric[] }) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={stagger(0.015)}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      {metrics.map((m) => {
        const Icon = KIND_ICON[m.kind];
        return (
          <motion.div
            key={m.key}
            variants={fadeUp}
            className="bg-card hover:border-brand/40 group relative overflow-hidden rounded-lg border p-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-faint text-[10px] leading-tight font-medium tracking-wider uppercase">
                {m.label}
              </span>
              <BarChart3 className="text-faint/50 size-3 shrink-0" />
            </div>
            <p
              className={cn(
                "numeric mt-2 flex items-center gap-1 text-lg font-bold tabular-nums",
                KIND_TONE[m.kind],
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" />
              {m.value}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
