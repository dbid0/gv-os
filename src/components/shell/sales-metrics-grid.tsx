"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BarChart3, DollarSign, Hash, Percent, Plus, X } from "lucide-react";

import { saveSalesMetrics } from "@/app/(app)/dashboard/metrics-actions";
import { useToast } from "@/components/ui/toast";
import type { MetricKind, SalesMetric, SalesMetricId } from "@/lib/sales/metrics";
import { fadeUp, stagger } from "@/lib/motion";
import { useEntranceOnce } from "@/lib/client-state";
import { cn } from "@/lib/utils";

/**
 * The RepVision-style KPI wall, now a metric BUILDER (Daniel's ask, WAP style):
 * a dense grid of the metrics the user has kept, each removable on hover, with
 * a "+" in the top right to add any of the rest from the catalog. Money is
 * tinted success, rates brand, counts neutral — so the wall reads at a glance
 * even at this density. The server formats every figure; this shell only picks
 * which show, and persists that choice per user.
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

export function SalesMetricsGrid({
  catalog,
  selected,
}: {
  /** Every catalog metric, already formatted on the server. */
  catalog: SalesMetric[];
  /** The user's chosen metric ids, in display order. */
  selected: SalesMetricId[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  // Optimistic wall: the UI moves instantly, the pref catches up.
  const [ids, setIds] = useState<SalesMetricId[]>(selected);

  const byKey = new Map(catalog.map((m) => [m.key, m]));
  const shown = ids
    .map((id) => byKey.get(id))
    .filter((m): m is SalesMetric => Boolean(m));
  const available = catalog.filter((m) => !ids.includes(m.key as SalesMetricId));

  const persist = (next: SalesMetricId[]) => {
    setIds(next);
    start(async () => {
      try {
        await saveSalesMetrics(next);
        router.refresh();
      } catch (e) {
        setIds(selected);
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not save your metrics.",
        });
      }
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-faint text-[11px] font-medium tracking-wider uppercase">
          Sales metrics
        </h2>
        <span className="bg-border h-px flex-1" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-label="Add a metric"
            className="text-muted-foreground hover:text-foreground hover:border-brand/40 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors"
          >
            <Plus className="size-3.5" /> Add metric
          </button>
          {adding && (
            <div className="gv-pop-in bg-card absolute top-full right-0 z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border p-2 shadow-xl">
              {available.length === 0 ? (
                <p className="text-faint px-2 py-3 text-center text-xs">
                  Every metric is on the wall.
                </p>
              ) : (
                available.map((m) => {
                  const Icon = KIND_ICON[m.kind];
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        persist([...ids, m.key as SalesMetricId]);
                        setAdding(false);
                      }}
                      className="hover:bg-secondary/60 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors"
                    >
                      <Icon
                        className={cn("mt-0.5 size-3.5 shrink-0", KIND_TONE[m.kind])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium">{m.label}</span>
                        <span className="text-faint block text-[11px]">{m.value}</span>
                      </span>
                      <Plus className="text-brand size-3.5 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-faint bg-card rounded-lg border px-4 py-8 text-center text-xs">
          No metrics on the wall — add one with the “+” above.
        </p>
      ) : (
        <motion.div
          initial={reduceMotion || !entrance ? false : "hidden"}
          animate="visible"
          variants={stagger(0.015)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {shown.map((m) => {
            const Icon = KIND_ICON[m.kind];
            return (
              <motion.div key={m.key} variants={fadeUp} className="group/card relative">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    persist(ids.filter((id) => id !== (m.key as SalesMetricId)))
                  }
                  aria-label={`Remove ${m.label}`}
                  className="bg-card text-faint hover:text-destructive absolute -top-2 -right-2 z-10 grid size-6 place-items-center rounded-full border opacity-0 shadow-sm transition-all group-hover/card:opacity-100"
                >
                  <X className="size-3" />
                </button>
                <div className="bg-card hover:border-brand/40 overflow-hidden rounded-lg border p-3 transition-colors">
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
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
