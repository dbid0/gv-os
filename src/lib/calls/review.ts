/**
 * WHICH CALLS THE SALES MANAGER ACTUALLY NEEDS TO SEE.
 *
 * Every read is worth storing; almost none of them are worth a ping. A manager
 * who gets notified about twenty-three calls has been notified about nothing,
 * so this decides the small subset that changes what happens next — and says
 * WHY, so the alert carries its own reason instead of "a call was analysed".
 *
 * Pure: no clock, no database. The escalation decision is the part that must
 * never drift, so it is testable to the branch.
 */

import type { CallAnalysis } from "@/lib/calls/call-analysis";

/** What the closer's own end-of-call report says happened. */
export type CallResult = "won" | "lost" | "stalled" | "unknown";

/**
 * Read the closer's status into a result.
 *
 * The vocabulary is whatever the closer typed into the EOC form — the live
 * Grid sheet holds "signed up - pif", "signed up - 2 pay", "closer follow up",
 * "no show", "ngmi", "Follow Up — Strong Interest". Nothing here guesses: a
 * status that matches none of these is `unknown`, and an unknown result is
 * never escalated on its own.
 */
export function readCallResult(status: string | null | undefined): CallResult {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "") return "unknown";
  // Won first: "signed up - pif" also contains no loss word, but being
  // explicit here keeps a future "signed up, no show for onboarding" honest.
  if (/(signed up|closed won|paid in full|\bpif\b|deposit taken)/.test(s)) return "won";
  if (/(no show|no-show|ngmi|not interested|dq|disqualif|lost|dead)/.test(s))
    return "lost";
  if (/(follow.?up|rescheduled|thinking|pending|nurture)/.test(s)) return "stalled";
  return "unknown";
}

export interface ReviewDecision {
  needed: boolean;
  /** One line naming why this call is in front of the manager. */
  reason: string | null;
  /** Higher sorts first in the queue. */
  priority: number;
}

/**
 * Should a manager look at this call?
 *
 * A won deal is not escalated — there is nothing to rescue, and a queue that
 * includes wins stops being a queue. A call with no coaching and no objections
 * is not escalated either: the read found nothing to act on, and forwarding it
 * would be noise dressed as insight.
 *
 * Priority puts the recoverable ones first. A STALLED call is where a manager
 * changes the outcome — the prospect is still live and the follow-up hasn't
 * happened yet — so it outranks one already lost.
 */
export function decideReview(input: {
  result: CallResult;
  analysis: Pick<CallAnalysis, "objections" | "missedSteps" | "coaching">;
}): ReviewDecision {
  const { result, analysis } = input;
  const actionable = analysis.coaching.length > 0 || analysis.missedSteps.length > 0;

  if (result === "won") {
    return { needed: false, reason: null, priority: 0 };
  }
  if (!actionable) {
    return { needed: false, reason: null, priority: 0 };
  }
  if (result === "unknown") {
    // No stated outcome: the read found something, but nobody said what
    // happened. Worth surfacing quietly, never at the top of the queue.
    return {
      needed: true,
      reason: "No outcome recorded on the end-of-call report",
      priority: 1,
    };
  }

  const missed = analysis.missedSteps.length;
  const objections = analysis.objections.length;
  const reason =
    result === "stalled"
      ? `Still open — ${missed} step${missed === 1 ? "" : "s"} missed on the call`
      : `Lost with ${objections} objection${objections === 1 ? "" : "s"} raised`;

  return {
    needed: true,
    reason,
    // Stalled outranks lost: the deal is still winnable.
    priority: (result === "stalled" ? 10 : 5) + Math.min(missed, 4),
  };
}

export interface ReviewCandidate {
  recordingId: string;
  clientId: string | null;
  clientSlug: string | null;
  title: string | null;
  rep: string | null;
  leadEmail: string | null;
  occurredAt: Date | null;
  result: CallResult;
  decision: ReviewDecision;
}

/**
 * The dedupe key for a call-review alert.
 *
 * Keyed on the RECORDING, not on the day or the rep, so re-running evaluation
 * never double-pings and a second call with the same rep still gets its own
 * alert.
 */
export function reviewDedupeKey(recordingId: string): string {
  return `call-review:${recordingId}`;
}

/** Queue order: most recoverable first, then most recent. */
export function orderReviews<
  T extends { decision: ReviewDecision; occurredAt: Date | null },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.decision.priority !== b.decision.priority) {
      return b.decision.priority - a.decision.priority;
    }
    return (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0);
  });
}
