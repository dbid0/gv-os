import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { type Cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * How a number is displayed in GV OS.
 *
 * Money always renders through here, never as a raw string, for three reasons:
 *
 * 1. It goes through formatUSD, so a value that is not integer cents cannot be
 *    displayed at all. The type system stops a float reaching a screen.
 * 2. Tabular numerals mean digits are equal width, so figures line up in a
 *    column and a value changing from 9 to 10 does not shift the layout.
 * 3. Negative amounts get one consistent treatment everywhere instead of each
 *    screen inventing its own.
 */

export function Money({
  amount,
  className,
  signed = false,
}: {
  amount: Cents;
  className?: string;
  /** Show an explicit + on positive values. For deltas and ledger rows. */
  signed?: boolean;
}) {
  const formatted = formatUSD(amount);

  return (
    <span
      className={cn(
        "numeric",
        amount < 0 && "text-destructive",
        signed && amount > 0 && "text-success",
        className,
      )}
    >
      {signed && amount > 0 ? `+${formatted}` : formatted}
    </span>
  );
}

/**
 * A single figure with its label, as a standalone tile.
 *
 * Layout follows the pattern that works: small-caps grey label, the metric's
 * icon in a quiet badge at the top right, then the number at a size that can be
 * read across a desk.
 *
 * `pending` is the honest default. Until the module behind a tile exists it
 * shows what it is waiting on. An em dash means "no data"; a zero would be a
 * claim that the real answer is nothing.
 */
export function Metric({
  label,
  value,
  hint,
  pending,
  icon: Icon,
  className,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
  pending?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div data-slot="metric" className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          {label}
        </p>
        {Icon && (
          <span className="bg-secondary text-faint grid size-6 shrink-0 place-items-center rounded-md border">
            <Icon className="size-3.5" />
          </span>
        )}
      </div>

      {pending ? (
        <div className="space-y-1.5">
          {/* An em dash, not a zero. Zero is an answer; this has none yet. */}
          <p className="numeric text-faint text-2xl leading-none font-semibold">—</p>
          <p className="text-faint text-xs">Waiting on: {pending}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="numeric text-2xl leading-none font-semibold">{value}</p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * A KPI inside a panel's summary row: coloured icon, label, big number.
 * Denser than Metric, for the three or four figures that lead a page.
 */
export function Kpi({
  label,
  value,
  icon: Icon,
  tone = "default",
  pending,
}: {
  label: string;
  value?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
  pending?: boolean;
}) {
  const tones = {
    default: "text-faint",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  } as const;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={cn("size-3.5 shrink-0", tones[tone])} />}
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <p
        className={cn(
          "numeric text-2xl leading-none font-semibold",
          pending && "text-faint",
        )}
      >
        {pending ? "—" : value}
      </p>
    </div>
  );
}
