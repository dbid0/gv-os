import Link from "next/link";

import type { HomeRange } from "@/lib/transactions/homepage";
import { cn } from "@/lib/utils";

/**
 * Quick range chips — the reference dashboard's Today / 7 days / This month /
 * All time row. Server-rendered links (the range lives in the URL), with the
 * full calendar picker beside them as the "custom" affordance. The chip row
 * changes WHICH window every card on the page reads — same param the picker
 * sets, so the two controls can never disagree.
 */
const CHIPS: { key: HomeRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "life", label: "All time" },
];

export function RangeChips({
  basePath,
  activeRange,
}: {
  basePath: string;
  activeRange: string;
}) {
  return (
    <div className="bg-secondary/40 flex items-center gap-0.5 rounded-lg border p-0.5">
      {CHIPS.map((c) => (
        <Link
          key={c.key}
          href={c.key === "30d" ? basePath : `${basePath}?range=${c.key}`}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeRange === c.key
              ? "bg-card text-foreground border shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}
