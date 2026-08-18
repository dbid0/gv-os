"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  CircleDollarSign,
  Download,
  FileText,
  Percent,
  PhoneCall,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Kpi, Metric } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { StatusDot, StatusPill } from "@/components/ui/status";
import { fadeUp, stagger } from "@/lib/motion";

/**
 * The dashboard, before there is anything to put on it.
 *
 * Deliberately NOT filled with invented metrics. Fake numbers on a money screen
 * are how a demo becomes a belief. Every figure shows an em dash and names the
 * module it is waiting on, so the empty state doubles as the build checklist.
 */

const headline = [
  { label: "Cash collected", icon: CircleDollarSign, tone: "brand" as const },
  { label: "Revenue", icon: TrendingUp, tone: "success" as const },
  { label: "Deals closed", icon: BarChart3, tone: "warning" as const },
  { label: "Close rate", icon: Percent, tone: "default" as const },
];

const tiles = [
  { label: "Applications", waiting: "Sales", icon: FileText },
  { label: "Calls booked", waiting: "Sales", icon: PhoneCall },
  { label: "Active reps", waiting: "Operations", icon: Users },
  { label: "Rev share owed", waiting: "Accounting", icon: CircleDollarSign },
];

const foundation = [
  { label: "Database", detail: "Postgres, migrated, prod and staging separated" },
  { label: "Money math", detail: "Integer cents, penny-exact splits, 100% covered" },
  { label: "Pipeline", detail: "Typecheck, lint, tests, and build on every commit" },
  { label: "Deploys", detail: "Production on main, a preview per pull request" },
];

const next = [
  { label: "Sales", detail: "VSL to application to setter to closer" },
  { label: "Accounting", detail: "Append-only ledger, reconciled to the sheet" },
  { label: "Operations", detail: "Tasks, EODs, and the calendar" },
];

const clients = ["The Grid", "The Vault", "Racks Closes"];

export function EmptyDashboard() {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState("sales");

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="mx-auto w-full max-w-7xl space-y-6"
    >
      <PageHeader
        title="The foundation is"
        highlight="live."
        description="Modules get designed before they get built, so nothing here shows a number until the data behind it is real."
        status={<StatusPill tone="live">All systems green</StatusPill>}
        actions={
          <>
            <Button variant="outline" size="sm" disabled className="gap-2">
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" disabled className="gap-2">
              <Download className="size-3.5" /> Export
            </Button>
          </>
        }
      />

      <motion.div variants={fadeUp}>
        <Segmented
          ariaLabel="Dashboard view"
          value={view}
          onChange={setView}
          segments={[
            { value: "sales", label: "Sales", icon: BarChart3 },
            { value: "money", label: "Money", icon: CircleDollarSign },
            { value: "team", label: "Team", icon: Users },
          ]}
        />
      </motion.div>

      {/* Headline figures, grouped in one panel so they read as a single
          summary rather than four unrelated widgets. */}
      <motion.div variants={fadeUp}>
        <Panel
          title="All clients"
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
            title="What is already standing"
            aside={<StatusPill tone="live">Verified</StatusPill>}
            padded={false}
          >
            <Rows>
              {foundation.map((item) => (
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
            title="What comes next"
            aside={<StatusPill tone="pending">Not started</StatusPill>}
            padded={false}
          >
            <Rows>
              {next.map((item) => (
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
