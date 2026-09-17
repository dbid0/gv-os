import { describe, expect, it } from "vitest";

import { recentSends, type SendRecord } from "@/lib/email/recent-sends";

const send = (over: Partial<SendRecord> = {}): SendRecord => ({
  id: "b1",
  subject: "A subject",
  sentAt: new Date("2026-09-10T15:00:00Z"),
  recipients: 1_000,
  emailsOpened: 400,
  totalClicks: 50,
  unsubscribes: 3,
  openTrackingDisabled: false,
  ...over,
});

describe("recentSends", () => {
  it("gives each send its own rates, over its own recipients", () => {
    expect(recentSends([send()])[0]).toMatchObject({
      openRatePct: 40,
      clickRatePct: 5,
    });
  });

  it("drops drafts — an unsent email has not done anything", () => {
    expect(recentSends([send({ sentAt: null })])).toEqual([]);
  });

  it("orders newest first", () => {
    const lines = recentSends([
      send({ id: "old", sentAt: new Date("2026-08-01T00:00:00Z") }),
      send({ id: "new", sentAt: new Date("2026-09-15T00:00:00Z") }),
      send({ id: "mid", sentAt: new Date("2026-09-01T00:00:00Z") }),
    ]);
    expect(lines.map((l) => l.id)).toEqual(["new", "mid", "old"]);
  });

  it("takes only the first N when asked, after sorting", () => {
    const lines = recentSends(
      [
        send({ id: "old", sentAt: new Date("2026-08-01T00:00:00Z") }),
        send({ id: "new", sentAt: new Date("2026-09-15T00:00:00Z") }),
      ],
      1,
    );
    expect(lines.map((l) => l.id)).toEqual(["new"]);
  });

  it("returns everything when no limit is given", () => {
    expect(recentSends([send({ id: "a" }), send({ id: "b" })])).toHaveLength(2);
  });

  it("reads an untracked send's open rate as unknown, never as zero", () => {
    // Kit reports no opens when tracking is off. 0% would say nobody opened it.
    const line = recentSends([
      send({ emailsOpened: null, openTrackingDisabled: true }),
    ])[0];
    expect(line.openRatePct).toBeNull();
    expect(line.openTrackingDisabled).toBe(true);
    // Clicks are still counted — only opens go dark.
    expect(line.clickRatePct).toBe(5);
  });

  it("reads a missing or zero denominator as unknown", () => {
    for (const recipients of [null, 0, -1]) {
      const line = recentSends([send({ recipients })])[0];
      expect(line.openRatePct).toBeNull();
      expect(line.clickRatePct).toBeNull();
    }
  });

  it("reads a missing numerator as unknown, not as none", () => {
    const line = recentSends([send({ emailsOpened: null, totalClicks: null })])[0];
    expect(line.openRatePct).toBeNull();
    expect(line.clickRatePct).toBeNull();
  });

  it("keeps a send with no subject rather than hiding it", () => {
    expect(recentSends([send({ subject: null })])).toHaveLength(1);
  });

  it("reads an account that has never sent as no sends", () => {
    expect(recentSends([])).toEqual([]);
  });
});
