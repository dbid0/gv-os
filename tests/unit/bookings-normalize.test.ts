import { describe, expect, it } from "vitest";

import {
  normalizeCalendlyEvent,
  normalizeGenericBooking,
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
