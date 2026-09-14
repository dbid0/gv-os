/**
 * CALLS BY CLOSER — the call log re-cut per closer, reconciling to the total.
 *
 * The reference product's rule for any per-rep table: every column is the same
 * numbers re-cut, so the rows always add up to the total above them. This
 * builds that table from the call log itself — the same rows, states and
 * outcomes the Calls page shows — so a closer's figures can never disagree with
 * the offer's.
 *
 * - Held = a call that needs an outcome, or a reported call whose report says
 *   it happened (a report saying it was rescheduled or cancelled is not held).
 * - A held call with no report yet sits in its own "No report yet" row: nobody
 *   has said who ran it.
 * - A reported call whose report names no closer sits in "No closer on the
 *   report", never folded into someone's row.
 * - Closer names merge the way the floor view merges them (case, whole-word
 *   first-name folding when it is unambiguous).
 * - Show rate = shows ÷ (shows + no-shows); close rate = closes ÷ shows; zero
 *   denominators are null, never 0%.
 *
 * Pure: no database.
 */

import type { CallLogRow } from "@/lib/calls/call-log";
import { canonicalRepNames } from "@/lib/tracking/activity";

export const NO_REPORT = "No report yet";
export const NO_CLOSER = "No closer on the report";

export type CloserSegment = {
  closer: string;
  /** True for the two catch-all rows, which are not people. */
  unattributed: boolean;
  held: number;
  shows: number;
  noShows: number;
  closes: number;
  showRate: number | null;
  closeRate: number | null;
};

export type CloserSegments = { rows: CloserSegment[]; total: CloserSegment };

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : (num / den) * 100;

const blank = (closer: string, unattributed: boolean): CloserSegment => ({
  closer,
  unattributed,
  held: 0,
  shows: 0,
  noShows: 0,
  closes: 0,
  showRate: null,
  closeRate: null,
});

const finish = (s: CloserSegment): CloserSegment => ({
  ...s,
  showRate: rate(s.shows, s.shows + s.noShows),
  closeRate: rate(s.closes, s.shows),
});

export function segmentByCloser(log: CallLogRow[]): CloserSegments {
  const held = log.filter(
    (r) =>
      r.state === "needs_outcome" ||
      (r.state === "reported" && r.outcome !== null && r.outcome !== "not_held"),
  );
  const canonical = canonicalRepNames(held.map((r) => r.closer ?? ""));
  const bySegment = new Map<string, CloserSegment>();
  const total = blank("All held calls", true);

  for (const r of held) {
    const closer = r.closer?.trim();
    let name: string;
    let unattributed = false;
    if (r.state === "needs_outcome") {
      name = NO_REPORT;
      unattributed = true;
    } else if (!closer) {
      name = NO_CLOSER;
      unattributed = true;
    } else {
      // canonicalRepNames keys every non-blank name it was given.
      name = canonical.get(closer.toLowerCase()) as string;
    }
    const seg = bySegment.get(name) ?? blank(name, unattributed);
    for (const target of [seg, total]) {
      target.held += 1;
      if (r.outcome === "no_show") target.noShows += 1;
      if (r.outcome === "showed" || r.outcome === "closed") target.shows += 1;
      if (r.outcome === "closed") target.closes += 1;
    }
    bySegment.set(name, seg);
  }

  const rows = [...bySegment.values()]
    .map(finish)
    .sort(
      (a, b) =>
        Number(a.unattributed) - Number(b.unattributed) ||
        b.closes - a.closes ||
        b.held - a.held ||
        a.closer.localeCompare(b.closer),
    );
  return { rows, total: finish(total) };
}
