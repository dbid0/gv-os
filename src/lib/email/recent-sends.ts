/**
 * THE SENDS THEMSELVES — what each email actually did.
 *
 * The Email screens answered "how much list do we have": subscribers,
 * sequences, tags, a growth chart, a list of sequence names. Daniel's read is
 * that none of that is the question — the question is whether an email landed
 * and got opened. An agency-wide open rate says the month was fine or it
 * wasn't; it cannot say WHICH email worked, and that is the only version of
 * this number anyone can act on.
 *
 * So each send carries its own rates, over its own recipients. Same rules as
 * the rollup (`offer-stats`), one send at a time:
 *
 *   - A draft has not done anything, so it is not a send.
 *   - A rate with no denominator is UNKNOWN — null, a dash — never 0%. Zero
 *     percent is a claim that nobody opened it.
 *   - A send with Kit's open tracking OFF reports no opens. Its open rate is
 *     unknown, not zero, and it says so rather than reading as a failure.
 *
 * Newest first, because the last thing sent is what anyone opens this page to
 * look at.
 *
 * Pure: no database, no clock.
 */

import type { BroadcastStat } from "@/lib/email/offer-stats";

/** A broadcast with enough identity to show it in a list. */
export interface SendRecord extends BroadcastStat {
  id: string;
  /** Kit lets a broadcast exist without one. */
  subject: string | null;
}

export interface SendLine {
  id: string;
  subject: string | null;
  sentAt: Date;
  recipients: number | null;
  /** 0–100 over THIS send's recipients, or null when it cannot be known. */
  openRatePct: number | null;
  clickRatePct: number | null;
  unsubscribes: number | null;
  /** True when the rate is unknown because tracking was off, not because it failed. */
  openTrackingDisabled: boolean;
}

/** A rate needs a denominator; without one the answer is "unknown". */
function rate(part: number | null, whole: number | null): number | null {
  if (typeof part !== "number" || typeof whole !== "number" || whole <= 0) return null;
  return (part / whole) * 100;
}

export function recentSends(sends: SendRecord[], limit?: number): SendLine[] {
  const lines = sends
    .filter((s): s is SendRecord & { sentAt: Date } => s.sentAt !== null)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .map((s) => ({
      id: s.id,
      subject: s.subject,
      sentAt: s.sentAt,
      recipients: s.recipients,
      openRatePct: s.openTrackingDisabled ? null : rate(s.emailsOpened, s.recipients),
      clickRatePct: rate(s.totalClicks, s.recipients),
      unsubscribes: s.unsubscribes,
      openTrackingDisabled: s.openTrackingDisabled,
    }));
  return limit === undefined ? lines : lines.slice(0, limit);
}
