import { Trophy } from "lucide-react";

import { Row, Rows } from "@/components/ui/panel";
import { type PersonalBest, formatDayKey } from "@/lib/gamification/engine";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

/** The "N PBs" count badge. */
export function PbCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const has = count > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        has
          ? "border-border-strong bg-secondary text-foreground"
          : "text-faint border-border",
        className,
      )}
    >
      <Trophy className={cn("size-3.5", has ? "text-foreground" : "text-faint")} />
      {count} {count === 1 ? "PB" : "PBs"}
    </span>
  );
}

/** A currency best renders as dollars; everything else as a plain count. */
function formatBest(pb: PersonalBest): string {
  return pb.format === "currency"
    ? formatUSD(cents(pb.value))
    : pb.value.toLocaleString();
}

/** The record book: one row per metric that has ever had a positive day. */
export function PersonalBests({ bests }: { bests: PersonalBest[] }) {
  if (bests.length === 0) {
    return (
      <p className="text-faint py-8 text-center text-sm">
        No personal bests yet — records set themselves as activity flows in.
      </p>
    );
  }
  return (
    <Rows>
      {bests.map((pb) => (
        <Row key={pb.key}>
          <span className="text-sm font-medium">{pb.label}</span>
          <span className="text-faint ml-auto text-xs">{formatDayKey(pb.dayKey)}</span>
          <span className="numeric w-24 text-right text-sm font-semibold">
            {formatBest(pb)}
          </span>
        </Row>
      ))}
    </Rows>
  );
}
