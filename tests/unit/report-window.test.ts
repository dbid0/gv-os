import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import {
  inWindow,
  isBounded,
  readReportRange,
  reportBounds,
} from "@/lib/tracking/report-window";
import { sourceFunnel } from "@/lib/tracking/source-funnel";

const TODAY = "2026-09-14";

describe("readReportRange / reportBounds", () => {
  it("defaults to all time and reads the known windows", () => {
    expect(readReportRange(undefined)).toBe("life");
    expect(readReportRange("forever")).toBe("life");
    expect(readReportRange("month")).toBe("month");
    expect(reportBounds("life", TODAY)).toMatchObject({ from: null, to: null });
    expect(reportBounds("month", TODAY)).toMatchObject({
      from: "2026-09-01",
      to: TODAY,
    });
    expect(reportBounds("30d", TODAY).from).toBe("2026-08-16");
  });
});

describe("inWindow", () => {
  const month = reportBounds("month", TODAY);
  it("takes everything, undated included, for all time", () => {
    const life = reportBounds("life", TODAY);
    expect(isBounded(life)).toBe(false);
    expect(inWindow(null, life, "America/Chicago")).toBe(true);
    expect(inWindow(new Date("2020-01-01T00:00:00Z"), life, "America/Chicago")).toBe(
      true,
    );
  });

  it("uses Central-time days, inclusive, and leaves undated rows out", () => {
    expect(isBounded(month)).toBe(true);
    expect(inWindow(null, month, "America/Chicago")).toBe(false);
    // 03:00 UTC Sep 1 is still Aug 31 in Chicago.
    expect(inWindow(new Date("2026-09-01T03:00:00Z"), month, "America/Chicago")).toBe(
      false,
    );
    expect(inWindow(new Date("2026-09-01T06:00:00Z"), month, "America/Chicago")).toBe(
      true,
    );
    expect(inWindow(new Date("2026-09-15T04:00:00Z"), month, "America/Chicago")).toBe(
      true,
    ); // Sep 14 CT
    expect(inWindow(new Date("2026-09-15T06:00:00Z"), month, "America/Chicago")).toBe(
      false,
    );
    expect(
      inWindow(
        new Date("2026-08-20T12:00:00Z"),
        {
          from: null,
          to: "2026-08-31",
          label: "",
        },
        "America/Chicago",
      ),
    ).toBe(true);
    expect(
      inWindow(
        new Date("2026-09-20T12:00:00Z"),
        {
          from: "2026-09-01",
          to: null,
          label: "",
        },
        "America/Chicago",
      ),
    ).toBe(true);
  });
});

function call(
  email: string,
  startsAt: Date | null,
  outcome: CallLogRow["outcome"],
): CallLogRow {
  return {
    bookingId: email + String(startsAt),
    inviteeName: null,
    inviteeEmail: email,
    startsAt,
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "reported",
    confirmation: "none",
    outcome,
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
  };
}

describe("sourceFunnel with a window", () => {
  it("counts first applications and calls inside it, keeps the source from history, blanks clicks", () => {
    const { rows, total } = sourceFunnel({
      links: [
        { utmSource: "youtube", utmMedium: "bio", utmCampaign: "x", clickCount: 50 },
      ],
      applications: [
        // Applied in August via YouTube, called in September: source kept,
        // not counted as a September applicant.
        {
          email: "old@x.com",
          submittedAt: new Date("2026-08-10T15:00:00Z"),
          utmSource: "youtube",
          utmMedium: null,
          utmCampaign: null,
        },
        {
          email: "new@x.com",
          submittedAt: new Date("2026-09-05T15:00:00Z"),
          utmSource: "youtube",
          utmMedium: null,
          utmCampaign: null,
        },
        {
          email: "undated@x.com",
          submittedAt: null,
          utmSource: "youtube",
          utmMedium: null,
          utmCampaign: null,
        },
      ],
      calls: [
        call("old@x.com", new Date("2026-09-08T15:00:00Z"), "closed"),
        call("new@x.com", new Date("2026-08-01T15:00:00Z"), "showed"),
        call("new@x.com", null, "showed"),
      ],
      dimension: "source",
      aliases: new Map(),
      window: reportBounds("month", TODAY),
      timeZone: "America/Chicago",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      value: "youtube",
      clicks: null,
      applicants: 1,
      bookedPeople: 1,
      held: 1,
      closes: 1,
    });
    expect(total.clicks).toBeNull();
  });
});
