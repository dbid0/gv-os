"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The top of every page.
 *
 * Exists so no screen has to decide its own heading size, spacing, or entrance
 * again. Consistency at the top of a page is most of what makes an app feel
 * like one product rather than a set of pages.
 *
 * `highlight` renders the trailing phrase in the brand gradient. One per page,
 * at most: it is the emphasis of last resort, not decoration.
 */
export function PageHeader({
  title,
  highlight,
  description,
  status,
  actions,
  className,
}: {
  title: string;
  highlight?: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();

  return (
    <motion.header
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
      className={cn("relative overflow-hidden rounded-xl", className)}
    >
      <div className="relative flex flex-wrap items-start justify-between gap-4 py-2">
        <div className="min-w-0 space-y-3">
          {status}

          <h1 className="text-2xl font-bold tracking-tight text-balance">
            {title}
            {highlight && <> </>}
            {highlight && (
              <span className="text-gradient-brand whitespace-nowrap">{highlight}</span>
            )}
          </h1>

          {description && (
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </motion.header>
  );
}
