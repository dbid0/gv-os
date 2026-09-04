/**
 * How many snapshots of a client's tracking sheet to keep.
 *
 * Each sync writes a FRESH snapshot — 823 rows for The Grid — so the mirror
 * grows by a full sheet every time it runs. Nothing pruned it, and every read
 * that scans "all snapshots" gets slower with each sync: after four runs the
 * review queue was already scanning 118 EOC rows to use 25.
 *
 * A few snapshots are worth keeping so a figure that moved can be compared
 * against what the sheet said yesterday. Beyond that they are dead weight.
 */
export const SNAPSHOTS_KEPT = 5;

/**
 * Which snapshot ids to delete, given one client's snapshots newest-first.
 *
 * Pure so the "never delete the current one" guarantee is testable: the head
 * of the list is what every read uses, and losing it would blank the offer.
 */
export function snapshotsToPrune(
  newestFirst: { id: string }[],
  keep = SNAPSHOTS_KEPT,
): string[] {
  if (keep < 1)
    throw new Error("keep must be at least 1 — never prune the current snapshot.");
  return newestFirst.slice(keep).map((s) => s.id);
}
