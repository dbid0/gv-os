"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { snappy } from "@/lib/motion";

/**
 * Route content entrance.
 *
 * Keyed by pathname so it replays on every navigation. Deliberately an entrance
 * only, with no exit: an exit animation means the old page has to finish
 * leaving before the new one starts, which adds real latency to every click.
 *
 * Tuned to feel IMMEDIATE: a 4px rise that snaps in on the brand spring, no
 * opacity fade. A page that fades in reads as "loading"; one that just arrives
 * reads as "instant". The per-page content does its own subtle stagger on top.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { y: 4 }}
      animate={{ y: 0 }}
      transition={reduceMotion ? { duration: 0 } : snappy}
    >
      {children}
    </motion.div>
  );
}
