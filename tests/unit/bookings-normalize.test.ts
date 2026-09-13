import { describe, expect, it } from "vitest";

import {
  normalizeCalendlyEvent,
  normalizeGenericBooking,
  normalizeIclosedEventCall,
} from "@/lib/bookings/normalize";

describe("normalizeCalendlyEvent", () => {
  const event = {
    uri: "https://api.calendly.com/scheduled_events/ABCDEF123",
    name: "Strategy Call ⚡️",
    status: "active",
    start_time: "2026-08-22T15:00:00.000000Z",
    created_at: "2026-08-21T14:05:00.000000Z",
  };

  it("uses the event uuid as the id and maps active → booked", () => {
    const out = normalizeCalendlyEvent(event, {
      name: "Lead Person",
      email: "lead@example.com",
    });
    expect(out).toEqual({
      externalId: "ABCDEF123",
      eventType: "Strategy Call ⚡️",
      inviteeName: "Lead Person",
      inviteeEmail: "lead@example.com",
      status: "booked",
      startsAt: "2026-08-22T15:00:00.000000Z",
      bookedAt: "2026-08-21T14:05:00.000000Z",
    });
  });

  it("maps canceled and works without an invitee", () => {
    const out = normalizeCalendlyEvent({ ...event, status: "canceled" });
    expect(out?.status).toBe("canceled");
    expect(out?.inviteeEmail).toBeNull();
  });

  it("rejects events without a uri", () => {
    expect(normalizeCalendlyEvent({ name: "x" })).toBeNull();
  });
});

describe("normalizeGenericBooking (iClosed and friends)", () => {
  it("probes ids, invitee fields, and cancel status across spellings", () => {
    const out = normalizeGenericBooking({
      booking_id: "ic_991",
      event_name: "Grid Strategy Call",
      invitee_name: "A Lead",
      invitee_email: "a@b.co",
      status: "confirmed",
      start_time: "2026-08-23T17:00:00Z",
    });
    expect(out).toMatchObject({
      externalId: "ic_991",
      inviteeEmail: "a@b.co",
      status: "booked",
      startsAt: "2026-08-23T17:00:00Z",
    });
    expect(
      normalizeGenericBooking({ data: { id: "n1" }, event: "booking.cancelled" })
        ?.status,
    ).toBe("canceled");
  });

  it("captures unknown-status payloads visibly and rejects id-less ones", () => {
    expect(normalizeGenericBooking({ id: "x_1" })?.status).toBe("unknown");
    expect(normalizeGenericBooking({ email: "no@id.com" })).toBeNull();
  });
});

describe("normalizeIclosedEventCall", () => {
  // Shape probed directly against public.api.iclosed.io/v1/eventCalls,
  // 2026-09-12 — trimmed to the fields the normalizer reads.
  const eventCall = {
    id: 2592206,
    dateTime: "2026-09-13 09:00:00.000",
    dateTimeUTC: "2026-09-13T13:00:00.000Z",
    cancelReason: null,
    cancelledBy: null,
    createdAt: "2026-09-11T23:27:48.632Z",
    callType: "STRATEGY_EVENT",
    inviteeEmail: "kikolerant@gmail.com",
    inviteeName: "Christopher Lérant ",
    contact: { email: "kikolerant@gmail.com", phoneNumber: "+421917975328" },
    event: { name: "Phone Farm Strategy Call ⚡️" },
    eventType: "UPCOMING",
  };

  it("maps a booked call: numeric id, dateTimeUTC → startsAt, event.name → eventType", () => {
    const out = normalizeIclosedEventCall(eventCall);
    expect(out).toEqual({
      externalId: "2592206",
      eventType: "Phone Farm Strategy Call ⚡️",
      inviteeName: "Christopher Lérant",
      inviteeEmail: "kikolerant@gmail.com",
      status: "booked",
      startsAt: "2026-09-13T13:00:00.000Z",
      bookedAt: "2026-09-11T23:27:48.632Z",
    });
  });

  it("maps canceled when cancelReason is set", () => {
    const out = normalizeIclosedEventCall({
      ...eventCall,
      cancelReason: "Host declined event from Google Calendar",
      cancelledBy: "closer (lorenzo)",
    });
    expect(out?.status).toBe("canceled");
  });

  it("falls back to contact.email when inviteeEmail is missing, and to null when neither is present", () => {
    expect(
      normalizeIclosedEventCall({ ...eventCall, inviteeEmail: null })?.inviteeEmail,
    ).toBe("kikolerant@gmail.com");
    expect(
      normalizeIclosedEventCall({ ...eventCall, inviteeEmail: null, contact: {} })
        ?.inviteeEmail,
    ).toBeNull();
  });

  it("falls back to callType when the event object is missing a name", () => {
    expect(normalizeIclosedEventCall({ ...eventCall, event: {} })?.eventType).toBe(
      "STRATEGY_EVENT",
    );
  });

  it("never guesses startsAt from the non-UTC dateTime field", () => {
    expect(
      normalizeIclosedEventCall({ ...eventCall, dateTimeUTC: null })?.startsAt,
    ).toBeNull();
  });

  it("rejects payloads without an id", () => {
    expect(normalizeIclosedEventCall({ inviteeEmail: "a@b.co" })).toBeNull();
  });
});
