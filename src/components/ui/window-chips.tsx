import Link from "next/link";

import { REPORT_RANGES, type ReportRange } from "@/lib/tracking/report-window";
import { cn } from "@/lib/utils";

/**
 * The date window for one re-cut table, as server-rendered links. The page
 * builds each href so the table's other filters survive a window change.
 */
export function WindowChips({
  active,
  hrefFor,
  label = "Window",
}: {
  active: ReportRange;
  hrefFor: (range: ReportRange) => string;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="bg-secondary/40 flex w-fit flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
    >
      {REPORT_RANGES.map((r) => (
        <Link
          key={r.key}
          href={hrefFor(r.key)}
          aria-current={active === r.key ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            active === r.key
              ? "bg-card text-foreground border shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
