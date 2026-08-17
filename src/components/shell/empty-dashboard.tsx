"use client";

import { motion, useReducedMotion } from "motion/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fadeUp, stagger } from "@/lib/motion";

/**
 * The dashboard, before there is anything to put on it.
 *
 * Deliberately NOT filled with invented metrics. Fake numbers on a money screen
 * are how a demo becomes a belief. Each tile states what it will hold and what
 * it is waiting on, so the empty state doubles as the build checklist.
 */

const tiles = [
  { title: "Cash collected", waiting: "Accounting module" },
  { title: "Applications", waiting: "Sales module" },
  { title: "Calls booked", waiting: "Sales module" },
  { title: "Rev share owed", waiting: "Accounting module" },
];

export function EmptyDashboard() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="mx-auto w-full max-w-6xl space-y-6"
    >
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-semibold tracking-tight">Good to go</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The foundation is live: database, migrations, CI, and deploys. Modules get
          designed before they get built.
        </p>
      </motion.div>

      <motion.div
        variants={stagger()}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {tiles.map((tile) => (
          <motion.div key={tile.title} variants={fadeUp}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {tile.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-7 w-24" />
                <p className="text-muted-foreground/70 text-xs">
                  Waiting on: {tile.waiting}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What happens next</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>
              Nothing here shows a number until the data behind it is real. Placeholder
              metrics on a money screen are how a demo quietly becomes a belief.
            </p>
            <p>
              Next: decide what this dashboard should actually answer each morning, then
              design the Sales module against it.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
