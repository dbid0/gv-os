import { describe, expect, it } from "vitest";

import {
  buildCallLog,
  countByState,
  groupByDay,
  type CallLogBooking,
  type FiledReport,
} from "@/lib/calls/call-log";
import { outcomeLabelForWords } from "@/lib/calls/eoc-form";
import type { EocReport } from "@/lib/crm/confirmation-rates";

const NOW = new Date("2026-09-14T18:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

function booking(
  id: string,
  startH: number | null,
  extra: Partial<CallLogBooking> = {},
) {
  return {
    id,
    inviteeName: null,
    inviteeEmail: `${id}@x.com`,
    startsAt: startH === null ? null : hours(startH),
    status: "booked",
    eventType: "Strategy call",
    provider: "calendly",
    ...extra,
  } satisfies CallLogBooking;
}

const sheet = (email: string, status: string, atH: number): EocReport => ({
  email,
  status,
  outcome: null,
  occurredAt: hours(atH),
});

const filed = (
  email: string,
  status: string,
  atH: number,
  bookingId: string | null,
): FiledReport => ({ ...sheet(email, status, atH), bookingId });

describe("buildCallLog", () => {
  const log = buildCallLog({
    bookings: [
      booking("up1", 5),
      booking("up2", 2),
      booking("grace", -0.5), // ended inside the hour of grace: still "upcoming"
      booking("stuck", -3),
      booking("sheet", -24),
      booking("app", -30),
      booking("unbound", -40),
      booking("cancel", -10, { status: "canceled" }),
      booking("noemail", -5, { inviteeEmail: null }),
      booking("undated", null),
    ],
    confirmations: [
      { bookingId: "up1", confirmedAt: hours(-1) },
      { bookingId: "stuck", confirmedAt: hours(-1) }, // after the call started
      { bookingId: "app", confirmedAt: null },
    ],
    filed: [
      filed("app@x.com", "closed won", -29, "app"),
      filed("unbound@x.com", "no show", -39, null),
      // A report bound to one booking never lands on another with the same email.
      filed("sheet@x.com", "closed won", -23, "some-other-booking"),
    ],
    sheet: [
      sheet("sheet@x.com", "follow up", -23),
      sheet("app@x.com", "no show", -29), // loses to the report filed against the booking
    ],
    now: NOW,
  });
  const byId = new Map(log.map((r) => [r.bookingId, r]));

  it("gives each booking its state", () => {
    expect(Object.fromEntries(log.map((r) => [r.bookingId, r.state]))).toEqual({
      up1: "upcoming",
      up2: "upcoming",
      grace: "upcoming",
      stuck: "needs_outcome",
      sheet: "reported",
      app: "reported",
      unbound: "reported",
      cancel: "cancelled",
      noemail: "needs_outcome",
      undated: "upcoming",
    });
  });

  it("reads confirmation as in time, after the start, or none", () => {
    expect(byId.get("up1")!.confirmation).toBe("in_time");
    expect(byId.get("stuck")!.confirmation).toBe("after_start");
    expect(byId.get("up2")!.confirmation).toBe("none");
    expect(byId.get("app")!.confirmation).toBe("none");
  });

  it("prefers the report filed against the booking, then unbound in-app, then the sheet", () => {
    expect(byId.get("app")).toMatchObject({
      outcome: "closed",
      outcomeWords: "closed won",
      reportSource: "app",
    });
    expect(byId.get("unbound")).toMatchObject({
      outcome: "no_show",
      reportSource: "app",
    });
    expect(byId.get("sheet")).toMatchObject({
      outcome: "showed",
      outcomeWords: "follow up",
      reportSource: "sheet",
    });
    expect(byId.get("stuck")).toMatchObject({
      outcome: null,
      outcomeWords: null,
      reportSource: null,
    });
  });

  it("orders upcoming soonest first, the rest newest first, undated last", () => {
    expect(log.map((r) => r.bookingId)).toEqual([
      "grace",
      "up2",
      "up1",
      "stuck",
      "noemail",
      "cancel",
      "sheet",
      "app",
      "unbound",
      "undated",
    ]);
  });

  it("counts by state", () => {
    expect(countByState(log)).toEqual({
      upcoming: 4,
      needs_outcome: 2,
      reported: 3,
      cancelled: 1,
    });
  });

  it("marks a moved booking as rescheduled, everything else not", () => {
    const [moved, plain] = buildCallLog({
      bookings: [
        booking("moved", -30, { status: "canceled", rescheduled: true }),
        booking("plain", -40, { status: "canceled" }),
      ],
      confirmations: [],
      filed: [],
      sheet: [],
      now: NOW,
    });
    expect([moved.bookingId, moved.state, moved.rescheduled]).toEqual([
      "moved",
      "cancelled",
      true,
    ]);
    expect([plain.bookingId, plain.rescheduled]).toEqual(["plain", false]);
  });

  it("keeps a cancelled call cancelled even when a report exists", () => {
    const [row] = buildCallLog({
      bookings: [booking("c", -5, { status: "canceled" })],
      confirmations: [],
      filed: [],
      sheet: [sheet("c@x.com", "no show", -4)],
      now: NOW,
    });
    expect(row).toMatchObject({ state: "cancelled", outcome: "no_show" });
  });

  it("treats a report with no usable words as no outcome", () => {
    const [row] = buildCallLog({
      bookings: [booking("blank", -5)],
      confirmations: [],
      filed: [],
      sheet: [
        { email: "blank@x.com", status: null, outcome: null, occurredAt: hours(-4) },
      ],
      now: NOW,
    });
    expect(row).toMatchObject({
      state: "needs_outcome",
      outcome: null,
      reportSource: "sheet",
    });
  });

  it("ignores reports with no email and sorts undated after dated either way round", () => {
    const rows = buildCallLog({
      bookings: [booking("undated", null), booking("dated", -5)],
      confirmations: [],
      filed: [filed("", "closed won", -4, null)],
      sheet: [{ email: null, status: "no show", outcome: null, occurredAt: hours(-4) }],
      now: NOW,
    });
    expect(rows.map((r) => [r.bookingId, r.reportSource])).toEqual([
      ["dated", null],
      ["undated", null],
    ]);
  });

  it("sorts two undated calls stably by id", () => {
    const rows = buildCallLog({
      bookings: [booking("b", null), booking("a", null)],
      confirmations: [],
      filed: [],
      sheet: [],
      now: NOW,
    });
    expect(rows.map((r) => r.bookingId)).toEqual(["a", "b"]);
  });
});

describe("groupByDay", () => {
  it("groups by Central-time day in row order, undated apart", () => {
    const rows = buildCallLog({
      bookings: [
        booking("late", null, { startsAt: new Date("2026-09-15T04:30:00Z") }), // 11:30pm CT on the 14th
        booking("early", null, { startsAt: new Date("2026-09-14T15:00:00Z") }),
        booking("next", null, { startsAt: new Date("2026-09-15T15:00:00Z") }),
        booking("none", null),
      ],
      confirmations: [],
      filed: [],
      sheet: [],
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(
      groupByDay(rows).map((d) => [d.key, d.rows.map((r) => r.bookingId)]),
    ).toEqual([
      ["2026-09-14", ["early", "late"]],
      ["2026-09-15", ["next"]],
      ["undated", ["none"]],
    ]);
  });
});

describe("outcomeLabelForWords", () => {
  it("maps stored words back to the form's labels, passing anything else through", () => {
    expect(outcomeLabelForWords("closed won")).toBe("Closed");
    expect(outcomeLabelForWords("no show")).toBe("No-show");
    expect(outcomeLabelForWords("signed up - pif")).toBe("signed up - pif");
  });
});
