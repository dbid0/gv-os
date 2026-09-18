/**
 * WHAT THE OPEN RATE ACTUALLY COVERS.
 *
 * The Email page leads with an open rate. On the live account that rate is
 * computed from TWO broadcasts sent on one day six weeks ago, while the email
 * that actually goes out runs through sequences — one of them 47 emails long,
 * another going to 260 people. Presented bare, "46% open" reads as the state
 * of the email program. It is the state of two emails.
 *
 * Two separate honesty problems, both handled here:
 *
 * 1. RECENCY. A rate is about the sends it measured, and those sends have a
 *    date. Past a month, it describes what email used to do, and the page has
 *    to say so rather than let a stale figure pass as current.
 *
 * 2. WHAT IS NOT MEASURED AT ALL. Kit's v4 API reports stats for broadcasts
 *    and nothing else: `/sequences/{id}/emails` returns subjects with no
 *    recipients and no opens, and `/sequences/{id}/stats` is a 404. So every
 *    sequence email is unmeasurable — not missing from our sync, absent from
 *    the API. The page must name that gap, because a rate silently covering
 *    4% of the sending is worse than no rate.
 *
 * This reports the gap; it never guesses a number to fill it. An unmeasured
 * send has no open rate, and no amount of arithmetic here can invent one.
 *
 * Pure: no database, no clock (the caller passes now).
 */

/** A sequence as the snapshot stores it. Counts are optional and may be old. */
export interface CoverageSequence {
  hold?: boolean;
  emailCount?: number;
  subscriberCount?: number;
}

export interface EmailCoverage {
  /** Whole days since the most recent measured send; null when never sent. */
  daysSinceLastSend: number | null;
  /** True when the rate describes the past rather than the present. */
  stale: boolean;
  /** Sequence emails Kit reports no stats for. Null when nothing is known. */
  unmeasuredEmails: number | null;
  /** People enrolled in the sequences those emails belong to. */
  sequenceSubscribers: number | null;
  /** Sequences currently sending (not on hold). */
  activeSequences: number;
  /** True when something is sending that the rate cannot see. */
  hasUnmeasured: boolean;
}

/**
 * How old a rate may be before the page stops presenting it as current.
 *
 * A month: long enough that a normal gap between campaigns does not raise a
 * flag, short enough that a rate from another quarter never reads as today's.
 */
export const STALE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sum of a field across sequences, or null when no sequence reported it. */
function sumKnown(
  sequences: CoverageSequence[],
  pick: (s: CoverageSequence) => number | undefined,
): number | null {
  let total = 0;
  let known = false;
  for (const s of sequences) {
    const v = pick(s);
    if (typeof v !== "number") continue;
    known = true;
    total += v;
  }
  return known ? total : null;
}

export function emailCoverage(
  lastSentAt: Date | null,
  sequences: CoverageSequence[],
  now: Date,
): EmailCoverage {
  const daysSinceLastSend =
    lastSentAt === null
      ? null
      : // Floor, so "sent 20 hours ago" is 0 days rather than 1.
        Math.max(0, Math.floor((now.getTime() - lastSentAt.getTime()) / DAY_MS));

  // Only sequences that are actually sending can carry email the rate misses.
  // A paused sequence's emails are not going out, so counting them would
  // overstate the gap.
  const sending = sequences.filter((s) => s.hold !== true);

  const unmeasuredEmails = sumKnown(sending, (s) => s.emailCount);
  const sequenceSubscribers = sumKnown(sending, (s) => s.subscriberCount);

  return {
    daysSinceLastSend,
    // Never sent at all is not "stale" — there is no rate to be stale.
    stale: daysSinceLastSend !== null && daysSinceLastSend > STALE_AFTER_DAYS,
    unmeasuredEmails,
    sequenceSubscribers,
    activeSequences: sending.length,
    hasUnmeasured: (unmeasuredEmails ?? 0) > 0,
  };
}
