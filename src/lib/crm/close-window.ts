/**
 * HOW FAR BACK A CLOSE PULL NEEDS TO LOOK.
 *
 * The pull used to re-read thirty days of activity on every pass. That was
 * harmless at one pass every half hour; with the sync running continuously it
 * meant re-downloading the same ~400 calls, texts and emails every two minutes
 * and offering each one back to the database, almost all of them already
 * stored. Captures are insert-only (a row that exists is left alone), so
 * re-reading an old row gains nothing.
 *
 * So a normal pass reads only what is new since the last SUCCESSFUL pull, with
 * an overlap so an activity created in the same instant the last pull ran —
 * or one Close indexed a little late — is still caught.
 *
 * Two cases fall back to the full thirty days:
 *   - there has never been a successful pull (first connect, or it has only
 *     ever failed) — lastSyncAt is null;
 *   - a full sweep has not run for FULL_SWEEP_EVERY_MS. The sweep is the
 *     safety net for anything the incremental passes could miss (an import
 *     that lands with an older creation date, a long outage). Speed-to-lead is
 *     judged over thirty days, so the stored record must cover all of them.
 *
 * The incremental window is never allowed to reach further back than the full
 * window: after a week offline the pass is simply a full sweep, not a read of
 * a week plus thirty days.
 *
 * Pure: no clock, no database.
 */

export const WINDOW_DAYS = 30;
export const OVERLAP_MS = 15 * 60 * 1000;
export const FULL_SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PullWindow {
  /** Read activity created after this instant. */
  since: Date;
  /** True when this pass reads the whole thirty days. */
  full: boolean;
}

export function closePullWindow(
  now: Date,
  lastSyncAt: Date | null,
  lastFullSweepAt: Date | null,
): PullWindow {
  const fullSince = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const sweepDue =
    lastSyncAt === null ||
    lastFullSweepAt === null ||
    now.getTime() - lastFullSweepAt.getTime() >= FULL_SWEEP_EVERY_MS;
  if (sweepDue) return { since: fullSince, full: true };

  const incremental = new Date(lastSyncAt.getTime() - OVERLAP_MS);
  // Never look further back than the full window does.
  return incremental < fullSince
    ? { since: fullSince, full: true }
    : { since: incremental, full: false };
}

/** The sweep timestamp stored on the connection, read defensively. */
export function readFullSweepAt(config: unknown): Date | null {
  if (typeof config !== "object" || config === null) return null;
  const raw = (config as Record<string, unknown>).closeFullSweepAt;
  if (typeof raw !== "string") return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}
