import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A rep's consecutive-day streak, as a badge.
 *
 * Built on the same pill shape as StatusPill so it reads like the rest of the
 * app: a brand-tinted surface when the streak is alive, quiet grey when there
 * is nothing to show yet. Zero is an honest "No streak yet", never a fake 0.
 */
export function StreakBadge({ days, className }: { days: number; className?: string }) {
  const active = days > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-brand/35 bg-brand-soft/60 text-foreground"
          : "text-faint border-border",
        className,
      )}
    >
      <Flame className={cn("size-3.5", active ? "text-brand" : "text-faint")} />
      {active ? `${days}-day streak` : "No streak yet"}
    </span>
  );
}
