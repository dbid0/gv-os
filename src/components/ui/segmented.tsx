"use client";

import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A segmented control: two to four mutually exclusive views of the same data.
 *
 * The selected segment is a filled bubble that SLIDES between options rather
 * than blinking on and off. The movement is what tells you the two views are
 * the same surface showing different things, which a fade does not.
 */

export type Segment = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

export function Segmented({
  segments,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  segments: Segment[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "bg-secondary/60 inline-flex items-center gap-1 rounded-xl border p-1",
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;

        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(segment.value)}
            className={cn(
              "press relative inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors",
              selected
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="segmented-active"
                transition={reduceMotion ? { duration: 0 } : snappy}
                className="border-border-strong bg-card elev-card absolute inset-0 -z-10 rounded-lg border"
              />
            )}
            {segment.icon && <segment.icon className="size-3.5 shrink-0" />}
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
