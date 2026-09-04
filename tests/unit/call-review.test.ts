import { describe, expect, it } from "vitest";

import { callReviewRule } from "@/lib/notifications/rules";
import { notificationHref } from "@/lib/notifications/links";
import {
  decideReview,
  orderReviews,
  readCallResult,
  reviewDedupeKey,
} from "@/lib/calls/review";

const analysis = (
  over: Partial<{
    objections: string[];
    missedSteps: string[];
    coaching: string[];
  }> = {},
) => ({
  objections: [],
  missedSteps: [],
  coaching: [],
  ...over,
});

describe("readCallResult", () => {
  it("reads the statuses closers actually type on The Grid", () => {
    // Verbatim from the live EOC tab.
    expect(readCallResult("signed up - pif")).toBe("won");
    expect(readCallResult("signed up - 2 pay")).toBe("won");
    expect(readCallResult("closer follow up")).toBe("stalled");
    expect(readCallResult("Follow Up — Strong Interest")).toBe("stalled");
    expect(readCallResult("no show")).toBe("lost");
    expect(readCallResult("ngmi")).toBe("lost");
  });

  it("is unknown rather than wrong for a status it does not recognise", () => {
    expect(readCallResult("asdf")).toBe("unknown");
    expect(readCallResult("")).toBe("unknown");
    expect(readCallResult(null)).toBe("unknown");
  });

  it("ignores case and stray spacing", () => {
    expect(readCallResult("  NO SHOW  ")).toBe("lost");
    expect(readCallResult("Signed Up - PIF")).toBe("won");
  });
});

describe("decideReview", () => {
  it("never escalates a won deal", () => {
    // There is nothing to rescue, and a queue containing wins stops being one.
    const d = decideReview({
      result: "won",
      analysis: analysis({
        coaching: ["ask for the card sooner"],
        missedSteps: ["no urgency"],
      }),
    });
    expect(d.needed).toBe(false);
  });

  it("never escalates a read with nothing to act on", () => {
    // Forwarding a call the read found nothing in is noise dressed as insight.
    expect(decideReview({ result: "lost", analysis: analysis() }).needed).toBe(false);
    expect(
      decideReview({ result: "lost", analysis: analysis({ objections: ["price"] }) })
        .needed,
    ).toBe(false);
  });

  it("escalates a stalled call and says why", () => {
    const d = decideReview({
      result: "stalled",
      analysis: analysis({
        missedSteps: ["no follow-up time set"],
        coaching: ["lock a time"],
      }),
    });
    expect(d.needed).toBe(true);
    expect(d.reason).toContain("Still open");
    expect(d.reason).toContain("1 step missed");
  });

  it("ranks a STALLED call above a lost one — it is still winnable", () => {
    const stalled = decideReview({
      result: "stalled",
      analysis: analysis({ missedSteps: ["a"], coaching: ["x"] }),
    });
    const lost = decideReview({
      result: "lost",
      analysis: analysis({ missedSteps: ["a"], coaching: ["x"] }),
    });
    expect(stalled.priority).toBeGreaterThan(lost.priority);
  });

  it("surfaces an unrecorded outcome quietly, never at the top", () => {
    const unknown = decideReview({
      result: "unknown",
      analysis: analysis({ coaching: ["x"] }),
    });
    const stalled = decideReview({
      result: "stalled",
      analysis: analysis({ coaching: ["x"] }),
    });
    expect(unknown.needed).toBe(true);
    expect(unknown.reason).toContain("No outcome recorded");
    expect(unknown.priority).toBeLessThan(stalled.priority);
  });

  it("pluralises its reason correctly", () => {
    const one = decideReview({
      result: "lost",
      analysis: analysis({ objections: ["price"], coaching: ["x"] }),
    });
    const two = decideReview({
      result: "lost",
      analysis: analysis({ objections: ["price", "timing"], coaching: ["x"] }),
    });
    expect(one.reason).toContain("1 objection ");
    expect(two.reason).toContain("2 objections ");
  });

  it("weights more missed steps higher, but caps the boost", () => {
    const few = decideReview({
      result: "lost",
      analysis: analysis({ missedSteps: ["a"] }),
    });
    const many = decideReview({
      result: "lost",
      analysis: analysis({ missedSteps: ["a", "b", "c", "d", "e", "f", "g"] }),
    });
    expect(many.priority).toBeGreaterThan(few.priority);
    // Capped, so one verbose read never buries every other call.
    expect(many.priority).toBeLessThanOrEqual(9);
  });
});

describe("reviewDedupeKey", () => {
  it("keys on the recording so re-evaluation never double-pings", () => {
    expect(reviewDedupeKey("rec-1")).toBe("call-review:rec-1");
    expect(reviewDedupeKey("rec-1")).toBe(reviewDedupeKey("rec-1"));
    expect(reviewDedupeKey("rec-2")).not.toBe(reviewDedupeKey("rec-1"));
  });
});

describe("orderReviews", () => {
  it("puts the most recoverable first, then the most recent", () => {
    const row = (priority: number, day: number, tag: string) => ({
      tag,
      decision: { needed: true, reason: null, priority },
      occurredAt: new Date(2026, 8, day),
    });
    const out = orderReviews([
      row(5, 20, "lost-recent"),
      row(11, 1, "stalled-old"),
      row(11, 9, "stalled-new"),
    ]);
    expect(out.map((r) => r.tag)).toEqual([
      "stalled-new",
      "stalled-old",
      "lost-recent",
    ]);
  });

  it("handles rows with no date without dropping them", () => {
    const rows = [
      {
        tag: "a",
        decision: { needed: true, reason: null, priority: 5 },
        occurredAt: null,
      },
      {
        tag: "b",
        decision: { needed: true, reason: null, priority: 9 },
        occurredAt: null,
      },
    ];
    expect(orderReviews(rows).map((r) => r.tag)).toEqual(["b", "a"]);
  });
});

describe("callReviewRule", () => {
  const call = (over: Partial<Parameters<typeof callReviewRule>[0][number]> = {}) => ({
    recordingId: "rec-1",
    clientId: "client-1",
    rep: "Lorenzo Saponara",
    reason: "Still open — 2 steps missed on the call",
    priority: 11,
    ...over,
  });

  it("names the rep and carries the reason, not a count of analyses", () => {
    // "6 calls were analysed" is not something a manager can act on.
    const [c] = callReviewRule([call()]);
    expect(c.title).toBe("Lorenzo Saponara: call needs a review");
    expect(c.body).toContain("Still open");
  });

  it("dedupes on the recording, so re-evaluation never double-pings", () => {
    const [a] = callReviewRule([call()]);
    const [b] = callReviewRule([call()]);
    expect(a.dedupeKey).toBe(b.dedupeKey);
    const [other] = callReviewRule([call({ recordingId: "rec-2" })]);
    expect(other.dedupeKey).not.toBe(a.dedupeKey);
  });

  it("warns on a still-winnable call and informs on a lost one", () => {
    expect(callReviewRule([call({ priority: 11 })])[0].severity).toBe("warning");
    expect(callReviewRule([call({ priority: 5 })])[0].severity).toBe("info");
  });

  it("falls back to a neutral title when the rep is unknown", () => {
    expect(callReviewRule([call({ rep: null })])[0].title).toBe(
      "A rep: call needs a review",
    );
  });

  it("raises nothing when nothing needs review", () => {
    expect(callReviewRule([])).toEqual([]);
  });

  it("links to the review inbox", () => {
    expect(notificationHref("call_review", null)).toBe("/sales/call-reviews");
  });
});
