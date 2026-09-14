import { StatusPill } from "@/components/ui/status";
import type { SnapshotFreshness } from "@/lib/tracking/freshness";

/**
 * How current the number above it is. The offer money + funnel cards read a
 * scheduled snapshot, not a live feed, so their age is part of the truth: a
 * stale figure gets a visible warning instead of passing for fresh, and a
 * never-synced feed says so plainly rather than showing a fake fresh state.
 *
 * Presentational and clock-free — the freshness is computed on the server and
 * handed in, so it renders identically on the server and after hydration.
 */
export function FeedFreshness({
  freshness,
  className,
}: {
  freshness: SnapshotFreshness;
  className?: string;
}) {
  if (freshness.state === "stale") {
    return (
      <StatusPill tone="progress" className={className}>
        Stale{freshness.ageLabel ? ` · synced ${freshness.ageLabel}` : ""}
      </StatusPill>
    );
  }
  if (freshness.state === "never") {
    return (
      <span className={`text-faint text-xs ${className ?? ""}`}>not synced yet</span>
    );
  }
  return (
    <span className={`text-faint text-xs ${className ?? ""}`}>
      synced {freshness.ageLabel}
    </span>
  );
}
