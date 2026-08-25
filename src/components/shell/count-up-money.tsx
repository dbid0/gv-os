"use client";

import { useCountUp } from "@/lib/client-state";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A money figure that counts up to its value — the same premium "landing" feel
 * as the dashboard hero, reusable on any server page (the value is passed as a
 * plain integer-cents number). SSR renders the real figure (no mismatch, correct
 * with JS off); reduced-motion jumps straight there. Always tabular-nums so the
 * animation never shifts layout width.
 */
export function CountUpMoney({
  cents: value,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const shown = useCountUp(value);
  return (
    <span className={cn("numeric tabular-nums", className)}>
      {formatUSD(cents(shown))}
    </span>
  );
}
