"use client";

import { motion, useReducedMotion } from "motion/react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { TableEmpty } from "@/components/ui/table";
import { fadeUp } from "@/lib/motion";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * A view that will be a table, before it has rows.
 *
 * Rather than invent sample data, it previews the real column structure as
 * chips and states plainly what has to land first. This is what lets Daniel
 * react to the shape of Deals, Commissions, and Leaderboard tonight without a
 * single fabricated number on the screen.
 */
export function SectionScaffold({
  title,
  waitingOn,
  columns,
  emptyTitle,
  emptyDetail,
}: {
  title: string;
  waitingOn: string;
  columns: string[];
  emptyTitle: string;
  emptyDetail: string;
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
    >
      <Panel
        title={title}
        aside={<StatusPill tone="pending">Waiting on {waitingOn}</StatusPill>}
      >
        <div className="space-y-8">
          <div>
            <p className="text-faint mb-3 text-[11px] font-medium tracking-wider uppercase">
              Columns
            </p>
            <div className="flex flex-wrap gap-2">
              {columns.map((column) => (
                <span
                  key={column}
                  className="border-border-strong bg-secondary/50 text-muted-foreground inline-flex items-center rounded-full border px-3 py-1 text-xs"
                >
                  {column}
                </span>
              ))}
            </div>
          </div>

          <div className="py-8">
            <TableEmpty title={emptyTitle} detail={emptyDetail} />
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}
