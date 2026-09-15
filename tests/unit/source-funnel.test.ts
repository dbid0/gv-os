import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import {
  NO_APPLICATION,
  NO_TAG,
  sourceFunnel,
  type FunnelApplication,
  type FunnelLink,
} from "@/lib/tracking/source-funnel";

const day = (d: number) => new Date(Date.UTC(2026, 8, d, 15));

const app = (
  email: string,
  d: number,
  source: string | null,
  campaign: string | null = null,
) =>
  ({
    email,
    submittedAt: day(d),
    utmSource: source,
    utmMedium: source ? "description" : null,
    utmCampaign: campaign,
  }) satisfies FunnelApplication;

function call(email: string | null, extra: Partial<CallLogRow> = {}): CallLogRow {
  return {
    bookingId: Math.random().toString(36).slice(2),
    inviteeName: null,
    inviteeEmail: email,
    startsAt: day(12),
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "reported",
    confirmation: "none",
    confirmedRole: null,
    outcome: "showed",
    outcomeWords: null,
    reportSource: "sheet",
    closer: null,
    setter: null,
    closeType: null,
    reportedCashCents: null,
    reportedRevenueCents: null,
    cancelReason: null,
    movedTo: null,
    movedFrom: null,
    ...extra,
  };
}

const links: FunnelLink[] = [
  {
    utmSource: "youtube",
    utmMedium: "description",
    utmCampaign: "main",
    clickCount: 120,
  },
  {
    utmSource: "YouTube ",
    utmMedium: "pinned-comment",
    utmCampaign: "main",
    clickCount: 30,
  },
  { utmSource: "instagram", utmMedium: "bio", utmCampaign: "reels", clickCount: 40 },
  { utmSource: " ", utmMedium: "bio", utmCampaign: "", clickCount: 5 },
];

const applications = [
  // Untagged first, tagged later: the first TAGGED arrival wins.
  app("a@x.com", 1, null),
  app("A@x.com", 3, "YouTube"),
  app("b@x.com", 2, "youtube"),
  app("alias@y.com", 4, "instagram"), // merged into b@x.com: already youtube
  app("c@x.com", 2, "instagram"),
  app("d@x.com", 5, null),
  {
    email: null,
    submittedAt: day(1),
    utmSource: "tiktok",
    utmMedium: null,
    utmCampaign: null,
  },
  {
    email: "e@x.com",
    submittedAt: null,
    utmSource: "tiktok",
    utmMedium: null,
    utmCampaign: null,
  },
];

const calls = [
  call("a@x.com", { outcome: "closed" }),
  call("a@x.com", { state: "cancelled", outcome: null }),
  call("b@x.com", { outcome: "no_show" }),
  call("alias@y.com", { outcome: "showed" }),
  call("c@x.com", { state: "upcoming", outcome: null }),
  call("d@x.com", { state: "needs_outcome", outcome: null }),
  call("walkin@x.com", { outcome: "closed" }),
  call(null, { state: "reported", outcome: "not_held" }),
];

const aliases = new Map([["alias@y.com", "b@x.com"]]);

describe("sourceFunnel by source", () => {
  const { rows, total } = sourceFunnel({
    links,
    applications,
    calls,
    dimension: "source",
    aliases,
  });
  const by = Object.fromEntries(rows.map((r) => [r.value, r]));

  it("buckets people by first tagged arrival, with honest catch-alls last", () => {
    expect(rows.map((r) => r.value)).toEqual([
      "youtube",
      "instagram",
      "tiktok",
      NO_APPLICATION,
      NO_TAG,
    ]);
    expect(by.youtube).toMatchObject({
      unattributed: false,
      clicks: 150,
      applicants: 2,
      bookedPeople: 2,
      held: 3,
      shows: 2,
      noShows: 1,
      closes: 1,
    });
    expect(by.youtube.bookRate).toBe(100);
    expect(by.youtube.showRate).toBeCloseTo((2 / 3) * 100);
    expect(by.youtube.closeRate).toBe(50);
    expect(by.instagram).toMatchObject({
      clicks: 40,
      applicants: 1,
      bookedPeople: 1,
      held: 0,
    });
    expect(by.instagram.showRate).toBeNull();
    // An applicant with no link in the registry: clicks unknown, not 0.
    expect(by.tiktok).toMatchObject({ clicks: null, applicants: 1, bookedPeople: 0 });
    expect(by[NO_TAG]).toMatchObject({ clicks: null, applicants: 1, held: 1 });
    expect(by[NO_APPLICATION]).toMatchObject({
      unattributed: true,
      applicants: 0,
      bookedPeople: 1,
      held: 1,
      closes: 1,
      bookRate: null,
    });
  });

  it("adds every row up to the total", () => {
    const sum = (
      k: "applicants" | "held" | "shows" | "noShows" | "closes" | "bookedPeople",
    ) => rows.reduce((n, r) => n + r[k], 0);
    expect(total).toMatchObject({
      value: "All",
      clicks: 190,
      applicants: sum("applicants"),
      held: sum("held"),
      shows: sum("shows"),
      noShows: sum("noShows"),
      closes: sum("closes"),
      bookedPeople: sum("bookedPeople"),
    });
    expect(total).toMatchObject({ applicants: 5, held: 5, closes: 2 });
    // Book rate counts applicants only: 4 of 5 applicants booked.
    expect(total.bookRate).toBe(80);
    expect(total.closeRate).toBeCloseTo((2 / 3) * 100);
  });
});

describe("sourceFunnel by other dimensions", () => {
  it("re-cuts by campaign, with no clicks at all giving a null total", () => {
    const { rows, total } = sourceFunnel({
      // A link with a blank campaign has no campaign row to count toward.
      links: [
        { utmSource: "youtube", utmMedium: "bio", utmCampaign: " ", clickCount: 3 },
      ],
      applications: [
        app("a@x.com", 1, "youtube", "Launch"),
        app("b@x.com", 2, "youtube"),
      ],
      calls: [],
      dimension: "campaign",
      aliases: new Map(),
    });
    expect(rows.map((r) => [r.value, r.applicants, r.clicks])).toEqual([
      ["launch", 1, null],
      [NO_TAG, 1, null],
    ]);
    expect(total.clicks).toBeNull();
    expect(total.bookRate).toBe(0);
  });

  it("re-cuts by medium and breaks ties by clicks then name", () => {
    const { rows } = sourceFunnel({
      links: [
        { utmSource: "youtube", utmMedium: "bio", utmCampaign: "x", clickCount: 5 },
        { utmSource: "youtube", utmMedium: "story", utmCampaign: "x", clickCount: 9 },
        { utmSource: "youtube", utmMedium: "dm", utmCampaign: "x", clickCount: 5 },
      ],
      applications: [app("z@x.com", 1, null)],
      calls: [],
      dimension: "medium",
      aliases: new Map(),
    });
    expect(rows.map((r) => r.value)).toEqual(["story", "bio", "dm", NO_TAG]);
    expect(
      sourceFunnel({
        links: [],
        applications: [],
        calls: [],
        dimension: "medium",
        aliases: new Map(),
      }).total.bookRate,
    ).toBeNull();
  });
});
