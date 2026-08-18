"use client";

import { motion, useReducedMotion } from "motion/react";

import { PageHeader } from "@/components/shell/page-header";
import { Metric } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusDot, StatusPill } from "@/components/ui/status";
import { fadeUp, stagger } from "@/lib/motion";

/**
 * The dashboard, before there is anything to put on it.
 *
 * Deliberately NOT filled with invented metrics. Fake numbers on a money screen
 * are how a demo becomes a belief. Each tile states what it will hold and what
 * it is waiting on, so the empty state doubles as the build checklist.
 */

const tiles = [
  { label: "Cash collected", waiting: "Accounting" },
  { label: "Applications", waiting: "Sales" },
  { label: "Calls booked", waiting: "Sales" },
  { label: "Rev share owed", waiting: "Accounting" },
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

export function EmptyDashboard() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="mx-auto w-full max-w-6xl space-y-8"
    >
      <PageHeader
        title="The foundation is"
        highlight="live."
        description="Modules get designed before they get built, so nothing here shows a number until the data behind it is real."
        status={<StatusPill tone="live">All systems green</StatusPill>}
      />

      {/* One hairline grid rather than four floating cards: denser, and it reads
          as a single instrument instead of four unrelated widgets. */}
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
            <Metric label={tile.label} pending={tile.waiting} />
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

      <motion.div variants={fadeUp}>
        <Panel title="The first decision">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Decide what this screen should answer first thing each morning. That answer
            defines the Sales module, and the Sales module defines what the tiles above
            become.
          </p>
        </Panel>
      </motion.div>
    </motion.div>
  );
}
