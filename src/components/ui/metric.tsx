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
 * A single figure with its label. The building block of every dashboard row.
 *
 * `pending` is the honest default: until the module behind a tile exists, it
 * shows what it is waiting on rather than a zero. A zero is a claim.
 */
export function Metric({
  label,
  value,
  hint,
  pending,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
  pending?: string;
}) {
  return (
    <div data-slot="metric" className="space-y-1.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </p>

      {pending ? (
        <>
          <div className="bg-muted/60 h-7 w-24 rounded" aria-hidden />
          <p className="text-muted-foreground/60 text-xs">Waiting on: {pending}</p>
        </>
      ) : (
        <>
          <p className="numeric text-2xl leading-none font-semibold">{value}</p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </>
      )}
    </div>
  );
}
