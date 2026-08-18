"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { entrance } from "@/lib/motion";

/**
 * Route content entrance.
 *
 * Keyed by pathname so it replays on every navigation. Deliberately an entrance
 * only, with no exit: an exit animation means the old page has to finish
 * leaving before the new one starts, which adds real latency to every click for
 * the sake of a flourish nobody asked for.
 *
 * 6px and 380ms. Enough to register as arrival, not enough to wait for.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : entrance}
    >
      {children}
    </motion.div>
  );
}
