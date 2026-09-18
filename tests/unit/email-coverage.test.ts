import { describe, expect, it } from "vitest";

import {
  emailCoverage,
  STALE_AFTER_DAYS,
  type CoverageSequence,
} from "@/lib/email/coverage";

const NOW = new Date("2026-09-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const seq = (over: Partial<CoverageSequence> = {}): CoverageSequence => ({
  emailCount: 4,
  subscriberCount: 100,
  ...over,
});

describe("emailCoverage — how old the rate is", () => {
  it("counts whole days since the last measured send", () => {
    expect(emailCoverage(daysAgo(6), [], NOW).daysSinceLastSend).toBe(6);
  });

  it("calls a send earlier today 0 days old, not 1", () => {
    const hoursAgo = new Date(NOW.getTime() - 20 * 60 * 60 * 1000);
    expect(emailCoverage(hoursAgo, [], NOW).daysSinceLastSend).toBe(0);
  });

  it("never reports negative days when a send is dated slightly ahead", () => {
    const ahead = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(emailCoverage(ahead, [], NOW).daysSinceLastSend).toBe(0);
  });

  it("marks a rate older than the threshold as stale", () => {
    expect(emailCoverage(daysAgo(STALE_AFTER_DAYS + 1), [], NOW).stale).toBe(true);
  });

  it("does not call a rate exactly at the threshold stale", () => {
    expect(emailCoverage(daysAgo(STALE_AFTER_DAYS), [], NOW).stale).toBe(false);
  });

  it("an account that never sent has no age and is not stale", () => {
    // There is no rate, so there is nothing to call old.
    const c = emailCoverage(null, [], NOW);
    expect(c.daysSinceLastSend).toBeNull();
    expect(c.stale).toBe(false);
  });
});

describe("emailCoverage — what the rate cannot see", () => {
  it("counts the emails in sequences that are sending", () => {
    const c = emailCoverage(
      daysAgo(1),
      [seq({ emailCount: 47 }), seq({ emailCount: 4 })],
      NOW,
    );
    expect(c.unmeasuredEmails).toBe(51);
    expect(c.hasUnmeasured).toBe(true);
    expect(c.activeSequences).toBe(2);
  });

  it("leaves a paused sequence out — its emails are not going anywhere", () => {
    // Counting them would overstate what the rate is missing.
    const c = emailCoverage(
      daysAgo(1),
      [seq({ emailCount: 47, hold: true }), seq({ emailCount: 4 })],
      NOW,
    );
    expect(c.unmeasuredEmails).toBe(4);
    expect(c.activeSequences).toBe(1);
  });

  it("sums the people enrolled in the sending sequences", () => {
    const c = emailCoverage(
      daysAgo(1),
      [seq({ subscriberCount: 260 }), seq({ subscriberCount: 153 })],
      NOW,
    );
    expect(c.sequenceSubscribers).toBe(413);
  });

  it("reads counts an older snapshot never captured as unknown, not zero", () => {
    // A snapshot from before those fields existed must not report "0 emails",
    // which would claim the rate covers everything.
    const c = emailCoverage(daysAgo(1), [{}, {}], NOW);
    expect(c.unmeasuredEmails).toBeNull();
    expect(c.sequenceSubscribers).toBeNull();
    expect(c.hasUnmeasured).toBe(false);
  });

  it("sums the sequences that did report, ignoring the ones that did not", () => {
    const c = emailCoverage(daysAgo(1), [seq({ emailCount: 10 }), {}], NOW);
    expect(c.unmeasuredEmails).toBe(10);
  });

  it("a real zero stays zero", () => {
    // An empty sequence reports 0 emails; that is known, and not a gap.
    const c = emailCoverage(daysAgo(1), [seq({ emailCount: 0 })], NOW);
    expect(c.unmeasuredEmails).toBe(0);
    expect(c.hasUnmeasured).toBe(false);
  });

  it("an account with no sequences has nothing unmeasured", () => {
    const c = emailCoverage(daysAgo(1), [], NOW);
    expect(c).toMatchObject({
      unmeasuredEmails: null,
      sequenceSubscribers: null,
      activeSequences: 0,
      hasUnmeasured: false,
    });
  });

  it("reproduces the live account's shape", () => {
    // The Grid on 2026-09-17: two broadcasts sent Aug 2, a 4-email webinar
    // nurture to 260 people and a 47-email forever nurture — none of which
    // Kit reports stats for.
    const c = emailCoverage(
      new Date("2026-08-02T23:39:00Z"),
      [
        seq({ emailCount: 4, subscriberCount: 260 }),
        seq({ emailCount: 47, subscriberCount: 153 }),
      ],
      NOW,
    );
    expect(c.stale).toBe(true);
    expect(c.daysSinceLastSend).toBe(45);
    expect(c.unmeasuredEmails).toBe(51);
    expect(c.sequenceSubscribers).toBe(413);
  });
});
