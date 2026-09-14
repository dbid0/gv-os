/**
 * HOW OLD IS THE MONEY MIRROR.
 *
 * The offer money + funnel cards read a tracking snapshot (the sheet / Stripe
 * mirror written by the scheduled pull), not a live feed. A snapshot can go
 * stale — a transient run failure, a dead key, a scheduler that stopped — and
 * a stale figure that renders as if it were fresh is a wrong number wearing a
 * right number's clothes. This turns the snapshot's age into a visible state.
 *
 * Pure: no clock, no database. `now` is passed in so the same input always
 * gives the same output, which is what makes it unit-testable.
 */

/**
 * A snapshot is STALE when it is older than this. The scheduler refreshes the
 * tracking mirrors every 30 minutes (integration-sync.yml, the 30-minute leg),
 * so 90 minutes means at least two consecutive pulls did nothing for this offer —
 * the mirror is no longer keeping up and the figure should say so rather than
 * read as current. Generous enough that a single slow run never cries wolf.
 */
export const SNAPSHOT_STALE_AFTER_MS = 90 * 60 * 1000;

export type SnapshotFreshnessState = "never" | "fresh" | "stale";

export interface SnapshotFreshness {
  state: SnapshotFreshnessState;
  /** Milliseconds since the snapshot was written; null when never synced. */
  ageMs: number | null;
  /** "just now" / "5m ago" / "3h ago" / "2d ago"; null when never synced. */
  ageLabel: string | null;
}

function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * The freshness of a tracking snapshot, given when it was written and now.
 *
 * A missing / unparseable timestamp is "never" — an honest "not synced yet",
 * never a fabricated fresh state. Everything else is fresh or stale purely by
 * age against the cadence threshold.
 */
export function snapshotFreshness(
  syncedAt: Date | string | null | undefined,
  now: Date,
): SnapshotFreshness {
  if (!syncedAt) return { state: "never", ageMs: null, ageLabel: null };
  const t = typeof syncedAt === "string" ? new Date(syncedAt) : syncedAt;
  if (Number.isNaN(t.getTime())) return { state: "never", ageMs: null, ageLabel: null };
  const ageMs = Math.max(0, now.getTime() - t.getTime());
  return {
    state: ageMs > SNAPSHOT_STALE_AFTER_MS ? "stale" : "fresh",
    ageMs,
    ageLabel: formatAge(ageMs),
  };
}
