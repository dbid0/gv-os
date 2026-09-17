/**
 * EMAIL, BY WHAT IT DID — not by how much of it there was.
 *
 * The Email page led with subscribers, sequences and tags: inventory. Daniel's
 * read is that volume is not the question — "I don't care how many emails
 * you're sending a day" — the question is whether they land and get opened.
 * So an offer's headline is its open rate, its click rate, and how many people
 * left, over the sends it actually made.
 *
 * RATES ARE WEIGHTED BY RECIPIENTS. Averaging the per-send percentages would
 * let a broadcast to 12 people move the number as much as one to 12,000, which
 * is how an offer ends up looking healthy on the strength of a test send. The
 * honest figure is total opens over total recipients.
 *
 * UNKNOWN IS NOT ZERO, and here it is a real risk: Kit lets an account turn
 * OFF open tracking, and those sends report no opens at all. Counting them as
 * zero opens would drag the rate down and read as "nobody opens our email"
 * when the truth is "we stopped measuring". Sends with tracking disabled are
 * excluded from the rate and counted separately, so the number always names
 * the sends it was measured over.
 *
 * Pure: no database, no clock.
 */

export interface BroadcastStat {
  /** Null while a broadcast is still a draft. */
  sentAt: Date | null;
  recipients: number | null;
  emailsOpened: number | null;
  totalClicks: number | null;
  unsubscribes: number | null;
  /** Kit reports no opens for these; they cannot enter an open rate. */
  openTrackingDisabled: boolean;
}

export interface EmailOfferStats {
  /** Broadcasts actually sent. Drafts are not sends. */
  sent: number;
  /** People the sent broadcasts reached. */
  recipients: number;
  /** Opens ÷ recipients, 0–100, over the sends that measured opens. */
  openRatePct: number | null;
  /** Clicks ÷ recipients, 0–100. */
  clickRatePct: number | null;
  unsubscribes: number;
  /** Sends excluded from the open rate because tracking was off. */
  untrackedSends: number;
  /** Recipients the open rate was measured over — the denominator. */
  measuredRecipients: number;
  /** The most recent send, or null if this offer has never sent. */
  lastSentAt: Date | null;
}

const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

export function emailOfferStats(broadcasts: BroadcastStat[]): EmailOfferStats {
  // A draft has not done anything yet, so it is not a send. The predicate lets
  // the compiler see that too, so nothing downstream needs a second null check.
  const sent = broadcasts.filter(
    (b): b is BroadcastStat & { sentAt: Date } => b.sentAt !== null,
  );

  const recipients = sent.reduce((n, b) => n + num(b.recipients), 0);
  const unsubscribes = sent.reduce((n, b) => n + num(b.unsubscribes), 0);
  const clicks = sent.reduce((n, b) => n + num(b.totalClicks), 0);

  // Only sends that actually measured opens may form the open rate.
  const tracked = sent.filter((b) => !b.openTrackingDisabled);
  const measuredRecipients = tracked.reduce((n, b) => n + num(b.recipients), 0);
  const opens = tracked.reduce((n, b) => n + num(b.emailsOpened), 0);

  const lastSentAt = sent.reduce<Date | null>(
    (latest, b) => (latest === null || b.sentAt > latest ? b.sentAt : latest),
    null,
  );

  return {
    sent: sent.length,
    recipients,
    openRatePct: measuredRecipients === 0 ? null : (opens / measuredRecipients) * 100,
    clickRatePct: recipients === 0 ? null : (clicks / recipients) * 100,
    unsubscribes,
    untrackedSends: sent.length - tracked.length,
    measuredRecipients,
    lastSentAt,
  };
}
