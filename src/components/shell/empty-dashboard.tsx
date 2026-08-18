"use client";

import { motion, useReducedMotion } from "motion/react";

import { Card, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
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

export function EmptyDashboard() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="mx-auto w-full max-w-6xl space-y-8"
    >
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-xl">
        <div className="grid-noise pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative space-y-3 py-2">
          <span className="border-border-strong bg-surface-brand text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className="dot-brand size-1.5 rounded-full" />
            Foundation live
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            The foundation is <span className="text-gradient-brand">live</span>.
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Modules get designed before they get built, so nothing here shows a number
            until the data behind it is real.
          </p>
        </div>
      </motion.div>

      <motion.div
        variants={stagger()}
        className="grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* A single hairline grid rather than four floating cards: denser, and it
            reads as one instrument instead of four unrelated widgets. */}
        {tiles.map((tile) => (
          <motion.div
            key={tile.label}
            variants={fadeUp}
            className="bg-card hover-lift p-5 outline outline-transparent"
          >
            <Metric label={tile.label} pending={tile.waiting} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-medium">What is already standing</h3>
              <span className="text-brand text-[11px] tracking-wider uppercase">
                Verified
              </span>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {foundation.map((item) => (
                <li key={item.label} className="flex gap-3">
                  <span
                    className="dot-brand mt-1.5 size-1.5 shrink-0 rounded-full"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm">{item.label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardContent className="space-y-2">
            <h3 className="text-sm font-medium">Next</h3>
            <p className="text-muted-foreground text-sm">
              Decide what this screen should answer first thing each morning. That
              answer defines the Sales module, and the Sales module defines what the
              tiles above become.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
