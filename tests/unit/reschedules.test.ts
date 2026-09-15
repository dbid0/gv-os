import { describe, expect, it } from "vitest";

import {
  cleanCancelReason,
  rescheduleTrail,
  type TrailBooking,
} from "@/lib/calls/reschedules";

const day = (d: number, h = 15) => new Date(Date.UTC(2026, 8, d, h));

function booking(id: string, extra: Partial<TrailBooking>): TrailBooking {
  return {
    id,
    inviteeEmail: "lead@x.com",
    status: "booked",
    rescheduled: false,
    startsAt: day(20),
    bookedAt: day(1),
    ...extra,
  };
}

describe("rescheduleTrail", () => {
  it("pairs a moved call with the invitee's next booking created before its start", () => {
    const trail = rescheduleTrail([
      booking("old", {
        status: "canceled",
        rescheduled: true,
        bookedAt: day(1),
        startsAt: day(10),
      }),
      booking("too-early", { bookedAt: day(1, 10), startsAt: day(9) }),
      booking("new", {
        inviteeEmail: " LEAD@x.com",
        bookedAt: day(5),
        startsAt: day(12),
      }),
      booking("later", { bookedAt: day(8), startsAt: day(14) }),
      booking("after-start", { bookedAt: day(11), startsAt: day(16) }),
    ]);
    expect(trail.get("old")).toEqual({
      movedTo: { bookingId: "new", startsAt: day(12) },
      movedFrom: null,
    });
    expect(trail.get("new")).toEqual({
      movedTo: null,
      movedFrom: { bookingId: "old", startsAt: day(10) },
    });
    expect(trail.has("later")).toBe(false);
    expect(trail.has("too-early")).toBe(false);
  });

  it("follows a call moved twice as a chain", () => {
    const trail = rescheduleTrail([
      booking("second", {
        status: "canceled",
        rescheduled: true,
        bookedAt: day(3),
        startsAt: day(12),
      }),
      booking("first", {
        status: "canceled",
        rescheduled: true,
        bookedAt: day(1),
        startsAt: day(10),
      }),
      booking("final", { bookedAt: day(6), startsAt: day(15) }),
    ]);
    expect(trail.get("first")?.movedTo?.bookingId).toBe("second");
    expect(trail.get("second")).toEqual({
      movedTo: { bookingId: "final", startsAt: day(15) },
      movedFrom: { bookingId: "first", startsAt: day(10) },
    });
  });

  it("leaves a move unpaired rather than guessing; ignores plain cancellations", () => {
    const trail = rescheduleTrail([
      booking("moved-nowhere", {
        status: "canceled",
        rescheduled: true,
        bookedAt: day(1),
        startsAt: day(3),
      }),
      booking("other-person", {
        inviteeEmail: "someone@x.com",
        bookedAt: day(2),
        startsAt: day(5),
      }),
      booking("plain-cancel", {
        status: "canceled",
        bookedAt: day(1),
        startsAt: day(4),
      }),
      booking("undated-move", {
        status: "canceled",
        rescheduled: true,
        bookedAt: null,
        startsAt: day(4),
      }),
      booking("no-email", {
        inviteeEmail: null,
        status: "canceled",
        rescheduled: true,
        bookedAt: day(1),
      }),
      booking("no-start-move", {
        inviteeEmail: "open@x.com",
        status: "canceled",
        rescheduled: true,
        bookedAt: day(1),
        startsAt: null,
      }),
      booking("open-next", {
        inviteeEmail: "open@x.com",
        bookedAt: day(9),
        startsAt: day(30),
      }),
    ]);
    expect(trail.has("moved-nowhere")).toBe(false);
    expect(trail.has("plain-cancel")).toBe(false);
    expect(trail.has("undated-move")).toBe(false);
    expect(trail.has("no-email")).toBe(false);
    // An old booking with no start time can pair with any later booking.
    expect(trail.get("no-start-move")?.movedTo?.bookingId).toBe("open-next");
  });
});

describe("cleanCancelReason", () => {
  it("tidies to one line and caps the length", () => {
    expect(cleanCancelReason("  Had a\n conflict ")).toBe("Had a conflict");
    expect(cleanCancelReason("   ")).toBeNull();
    expect(cleanCancelReason(null)).toBeNull();
    expect(cleanCancelReason(undefined)).toBeNull();
    const long = cleanCancelReason("x".repeat(200)) as string;
    expect(long).toHaveLength(140);
    expect(long.endsWith("…")).toBe(true);
  });
});
