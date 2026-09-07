import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A headline stat as a CARD — bordered, accent-striped, lifting on hover —
 * for section tops (workspace leads / CRM / portal). The inline `Kpi` stays
 * for dense in-panel rows; this is the louder sibling for a page's first read.
 */
export function StatCard({
  label,
  value,
  hint,
  accent,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Small line under the value — the window, the unit, the caveat. */
  hint?: string;
  /** The client's own colour for the top stripe; defaults to the brand. */
  accent?: string;
  tone?: "default" | "brand" | "success" | "warning";
  className?: string;
}) {
  const tones = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
  } as const;
  return (
    <div
      className={cn(
        "card-grad hover-lift relative overflow-hidden rounded-xl border p-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: accent ?? "var(--brand)" }}
      />
      <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className={cn("numeric mt-1 text-3xl font-bold tracking-tight", tones[tone])}>
        {value}
      </p>
      {hint && <p className="text-faint mt-0.5 text-[11px]">{hint}</p>}
    </div>
  );
}
