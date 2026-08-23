"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  FileText,
  Percent,
  PhoneCall,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Kpi, Metric } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusDot, StatusPill } from "@/components/ui/status";
import { fadeUp, stagger } from "@/lib/motion";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The Sales overview.
 *
 * The focused KPI set RepVision buries in a forty-card grid — the handful that
 * actually move a revenue decision — plus per-team pacing and EOD compliance.
 * Nothing shows a number yet: an em dash names the pipeline each figure waits
 * on, so the screen doubles as the build order. The engine panel is the honest
 * counterweight — the money math underneath is already built and tested.
 */

const headline = [
  { label: "Cash collected", icon: CircleDollarSign, tone: "brand" as const },
  { label: "Revenue", icon: TrendingUp, tone: "success" as const },
  { label: "Deals closed", icon: BarChart3, tone: "warning" as const },
  { label: "Close rate", icon: Percent, tone: "default" as const },
];

const tiles = [
  { label: "Applications", waiting: "Sales intake", icon: FileText },
  { label: "Calls booked", waiting: "Sales intake", icon: PhoneCall },
  { label: "Show rate", waiting: "EOD activity", icon: CalendarCheck },
  { label: "Commission owed", waiting: "Commissions", icon: Wallet },
];

const clients = ["The Grid", "The Vault", "Racks Closes"];

const engine = [
  {
    label: "Commission engine",
    detail: "Rate x cash or revenue, rounded to the cent. 100% covered.",
  },
  {
    label: "Payout rollup",
    detail: "Per-rep owed lines, manager skim, and a mark-paid checklist.",
  },
  {
    label: "Schema",
    detail: "Reps, commission splits, and EOD activity on the existing deal.",
  },
];

const pipeline = [
  { label: "Deal import", detail: "The finance sheet's closed deals into the ledger" },
  { label: "Rep + split entry", detail: "Who closed it, and each participant's cut" },
  { label: "EOD activity", detail: "Dials, sets, shows, and closes from Operations" },
];

export function SalesOverview() {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="space-y-6"
    >
      {/* Headline figures, grouped as one summary rather than four widgets. */}
      <motion.div variants={fadeUp}>
        <Panel
          title="All teams"
          aside={<span className="text-faint text-xs">3 active</span>}
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {headline.map((k) => (
              <Kpi key={k.label} label={k.label} icon={k.icon} tone={k.tone} pending />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
            {clients.map((client) => (
              <span
                key={client}
                className="border-border-strong bg-secondary/50 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
              >
                {client}
                <span className="text-faint">•</span>
                <span className="numeric text-faint">—</span>
              </span>
            ))}
          </div>
        </Panel>
      </motion.div>

      {/* The second-tier figures, one row, each naming what it waits on. */}
      <motion.div
        variants={stagger()}
        className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={fadeUp}>
          <Panel
            title="Engine, already built"
            aside={<StatusPill tone="live">Tested</StatusPill>}
            padded={false}
          >
            <Rows>
              {engine.map((item) => (
                <Row key={item.label}>
                  <StatusDot tone="live" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {item.detail}
                    </span>
                  </span>
                </Row>
              ))}
            </Rows>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Panel
            title="Pipeline that fills these"
            aside={<StatusPill tone="pending">Next</StatusPill>}
            padded={false}
          >
            <Rows>
              {pipeline.map((item) => (
                <Row key={item.label}>
                  <StatusDot tone="muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {item.detail}
                    </span>
                  </span>
                </Row>
              ))}
            </Rows>
          </Panel>
        </motion.div>
      </div>
    </motion.div>
  );
}
