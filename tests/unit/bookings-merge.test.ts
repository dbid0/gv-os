import { describe, expect, it } from "vitest";

import {
  bookingWrite,
  needsInvitee,
  pickInvitee,
  type StoredBooking,
} from "@/lib/bookings/merge";
import {
  normalizeCalendlyEvent,
  normalizeGenericBooking,
  normalizeIclosedEventCall,
  type NormalizedBooking,
} from "@/lib/bookings/normalize";

const T = (iso: string) => new Date(iso);

function incoming(extra: Partial<NormalizedBooking> = {}): NormalizedBooking {
  return {
    externalId: "evt-1",
    eventType: "Strategy call",
    inviteeName: "Lead Person",
    inviteeEmail: "lead@example.com",
    status: "booked",
    rescheduled: false,
    startsAt: "2026-09-20T15:00:00.000Z",
    bookedAt: "2026-09-10T12:00:00.000Z",
    ...extra,
  };
}

const stored: StoredBooking = {
  eventType: "Strategy call",
  inviteeName: "Lead Person",
  inviteeEmail: "lead@example.com",
  status: "booked",
  rescheduled: false,
  startsAt: T("2026-09-20T15:00:00.000Z"),
  bookedAt: T("2026-09-10T12:00:00.000Z"),
};

describe("bookingWrite", () => {
  it("writes a new booking as the provider sent it", () => {
    expect(bookingWrite(null, incoming())).toEqual({ values: stored, change: "new" });
    expect(
      bookingWrite(null, incoming({ startsAt: "not a date", bookedAt: null })).values,
    ).toMatchObject({ startsAt: null, bookedAt: null });
  });

  it("changes nothing when the provider says the same thing", () => {
    expect(bookingWrite(stored, incoming())).toEqual({
      values: stored,
      change: "unchanged",
    });
  });

  it("follows the provider when a booked call is cancelled or moved", () => {
    const cancelled = bookingWrite(stored, incoming({ status: "canceled" }));
    expect(cancelled.change).toBe("updated");
    expect(cancelled.values.status).toBe("canceled");

    const moved = bookingWrite(
      stored,
      incoming({ startsAt: "2026-09-22T18:00:00.000Z", rescheduled: true }),
    );
    expect(moved).toMatchObject({
      change: "updated",
      values: { startsAt: T("2026-09-22T18:00:00.000Z"), rescheduled: true },
    });
  });

  it("never erases what is known: invitee, time, type, a known status, the first booked-at", () => {
    const sparse = bookingWrite(
      stored,
      incoming({
        inviteeName: null,
        inviteeEmail: null,
        status: "unknown",
        startsAt: null,
        eventType: null,
        bookedAt: "2026-09-12T00:00:00.000Z",
      }),
    );
    expect(sparse).toEqual({ values: stored, change: "unchanged" });
  });

  it("fills an invitee that was missing, and keeps a reschedule once seen", () => {
    const blank: StoredBooking = {
      ...stored,
      inviteeName: null,
      inviteeEmail: null,
      rescheduled: true,
      bookedAt: null,
    };
    expect(bookingWrite(blank, incoming())).toEqual({
      values: { ...stored, rescheduled: true },
      change: "updated",
    });
  });

  it("notices a change to any single field", () => {
    for (const change of [
      { eventType: "Discovery" },
      { inviteeName: "Someone" },
      { inviteeEmail: "x@y.z" },
    ]) {
      const base: StoredBooking = {
        ...stored,
        ...{ eventType: null, inviteeName: null, inviteeEmail: null },
      };
      expect(bookingWrite(base, incoming(change)).change).toBe("updated");
    }
    expect(
      bookingWrite({ ...stored, bookedAt: null }, incoming()).values.bookedAt,
    ).toEqual(T("2026-09-10T12:00:00.000Z"));
  });
});

describe("needsInvitee / pickInvitee", () => {
  it("fetches an invitee only when no email is stored", () => {
    expect(needsInvitee(undefined)).toBe(true);
    expect(needsInvitee(null)).toBe(true);
    expect(needsInvitee("")).toBe(true);
    expect(needsInvitee("lead@example.com")).toBe(false);
  });

  it("prefers the active invitee, else the most recently updated", () => {
    const old = {
      status: "canceled",
      updated_at: "2026-09-01T00:00:00Z",
      email: "old@x.com",
    };
    const newer = {
      status: "canceled",
      updated_at: "2026-09-05T00:00:00Z",
      email: "newer@x.com",
    };
    const active = { status: "active", email: "active@x.com" };
    expect(pickInvitee([old, active, newer])).toBe(active);
    expect(pickInvitee([old, newer])).toBe(newer);
    expect(pickInvitee([{ email: "a" }, { email: "b" }])?.email).toBe("a");
    expect(pickInvitee([])).toBeUndefined();
  });
});

describe("reschedule detection in the normalizers", () => {
  const event = {
    uri: "https://api.calendly.com/scheduled_events/EVT",
    name: "Call",
    status: "canceled",
    start_time: "2026-09-20T15:00:00Z",
    created_at: "2026-09-10T12:00:00Z",
  };

  it("reads Calendly's rescheduled invitee flag, and only a true boolean", () => {
    expect(
      normalizeCalendlyEvent(event, { email: "a@x.com", rescheduled: true })
        ?.rescheduled,
    ).toBe(true);
    expect(
      normalizeCalendlyEvent(event, { email: "a@x.com", rescheduled: "true" })
        ?.rescheduled,
    ).toBe(false);
    expect(normalizeCalendlyEvent(event)?.rescheduled).toBe(false);
  });

  it("reads iClosed and generic reschedule wording", () => {
    expect(
      normalizeIclosedEventCall({ id: 1, cancelReason: "Rescheduled by invitee" })
        ?.rescheduled,
    ).toBe(true);
    expect(
      normalizeIclosedEventCall({ id: 2, cancelReason: "No longer interested" })
        ?.rescheduled,
    ).toBe(false);
    expect(normalizeIclosedEventCall({ id: 3 })?.rescheduled).toBe(false);
    expect(
      normalizeGenericBooking({ id: "g", event: "booking.rescheduled" })?.rescheduled,
    ).toBe(true);
    expect(
      normalizeGenericBooking({ id: "h", event: "booking.created" })?.rescheduled,
    ).toBe(false);
  });
});
