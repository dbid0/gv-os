import { describe, expect, it } from "vitest";

import { emailOfferStats, type BroadcastStat } from "@/lib/email/offer-stats";

const send = (over: Partial<BroadcastStat> = {}): BroadcastStat => ({
  sentAt: new Date("2026-09-10T12:00:00Z"),
  recipients: 1000,
  emailsOpened: 400,
  totalClicks: 50,
  unsubscribes: 3,
  openTrackingDisabled: false,
  ...over,
});

describe("emailOfferStats", () => {
  it("reads rates off the totals", () => {
    const s = emailOfferStats([send()]);
    expect(s.sent).toBe(1);
    expect(s.recipients).toBe(1000);
    expect(s.openRatePct).toBeCloseTo(40, 6);
    expect(s.clickRatePct).toBeCloseTo(5, 6);
    expect(s.unsubscribes).toBe(3);
  });

  it("weights by recipients instead of averaging percentages", () => {
    // A test send to 10 people opened by everyone must not drag the headline
    // up to ~70%. Total opens over total recipients is the honest figure.
    const s = emailOfferStats([
      send({ recipients: 10_000, emailsOpened: 4_000 }),
      send({ recipients: 10, emailsOpened: 10 }),
    ]);
    // Mean of percentages would be (40 + 100) / 2 = 70.
    expect(s.openRatePct).toBeCloseTo((4_010 / 10_010) * 100, 6);
    expect(s.openRatePct!).toBeLessThan(41);
  });

  it("does not count a draft as a send", () => {
    const s = emailOfferStats([send(), send({ sentAt: null, recipients: 5_000 })]);
    expect(s.sent).toBe(1);
    expect(s.recipients).toBe(1000);
  });

  it("keeps sends with open tracking off out of the open rate", () => {
    // Counting them as zero opens reads as "nobody opens our email" when the
    // truth is "we stopped measuring".
    const s = emailOfferStats([
      send({ recipients: 1000, emailsOpened: 500 }),
      send({ recipients: 1000, emailsOpened: 0, openTrackingDisabled: true }),
    ]);
    expect(s.openRatePct).toBeCloseTo(50, 6);
    expect(s.measuredRecipients).toBe(1000);
    expect(s.untrackedSends).toBe(1);
    // They are still real sends and their recipients still count as reach.
    expect(s.sent).toBe(2);
    expect(s.recipients).toBe(2000);
  });

  it("has no open rate at all when nothing measured opens", () => {
    const s = emailOfferStats([send({ openTrackingDisabled: true })]);
    expect(s.openRatePct).toBeNull();
    expect(s.measuredRecipients).toBe(0);
  });

  it("has no rates for an offer that has never sent", () => {
    const s = emailOfferStats([]);
    expect(s).toMatchObject({
      sent: 0,
      recipients: 0,
      openRatePct: null,
      clickRatePct: null,
      lastSentAt: null,
    });
  });

  it("treats a missing figure as absent, not as a crash", () => {
    const s = emailOfferStats([
      send({
        recipients: null,
        emailsOpened: null,
        totalClicks: null,
        unsubscribes: null,
      }),
    ]);
    expect(s.sent).toBe(1);
    expect(s.recipients).toBe(0);
    expect(s.openRatePct).toBeNull();
  });

  it("reports the most recent send", () => {
    const s = emailOfferStats([
      send({ sentAt: new Date("2026-09-01T00:00:00Z") }),
      send({ sentAt: new Date("2026-09-14T00:00:00Z") }),
      send({ sentAt: new Date("2026-09-08T00:00:00Z") }),
    ]);
    expect(s.lastSentAt?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});
