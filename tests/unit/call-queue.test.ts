import { describe, expect, it } from "vitest";

import { callQueue, type QueueBooking } from "@/lib/home/call-queue";

const at = (iso: string) => new Date(iso);

const booking = (over: Partial<QueueBooking> = {}): QueueBooking => ({
  id: "b1",
  inviteeName: "A Lead",
  eventType: "Strategy call",
  startsAt: at("2026-09-17T18:00:00Z"),
  status: "booked",
  ...over,
});

// A Central-time day, as the page computes it for the viewer.
const NOW = at("2026-09-17T16:00:00Z");
const DAY_START = at("2026-09-17T05:00:00Z");
const DAY_END = at("2026-09-18T05:00:00Z");

const q = (bookings: QueueBooking[], now = NOW) =>
  callQueue(bookings, now, DAY_START, DAY_END);

describe("callQueue", () => {
  it("puts today's calls in time order", () => {
    const out = q([
      booking({ id: "late", startsAt: at("2026-09-17T21:00:00Z") }),
      booking({ id: "early", startsAt: at("2026-09-17T14:00:00Z") }),
      booking({ id: "mid", startsAt: at("2026-09-17T18:00:00Z") }),
    ]);
    expect(out.today.map((c) => c.id)).toEqual(["early", "mid", "late"]);
  });

  it("marks a call whose time has passed as started, not as gone", () => {
    const out = q([
      booking({ id: "done", startsAt: at("2026-09-17T14:00:00Z") }),
      booking({ id: "soon", startsAt: at("2026-09-17T18:00:00Z") }),
    ]);
    expect(out.today.map((c) => c.started)).toEqual([true, false]);
  });

  it("treats a call starting exactly now as started", () => {
    expect(q([booking({ startsAt: NOW })]).today[0].started).toBe(true);
  });

  it("drops a cancelled booking, whatever the casing", () => {
    const out = q([
      booking({ id: "dead", status: " Canceled " }),
      booking({ id: "live" }),
    ]);
    expect(out.today.map((c) => c.id)).toEqual(["live"]);
  });

  it("drops a cancelled booking that was rescheduled — the new time is its own row", () => {
    // Keeping both would double-book the hour.
    const out = q([
      booking({
        id: "moved",
        status: "canceled",
        startsAt: at("2026-09-17T14:00:00Z"),
      }),
      booking({ id: "new-time", startsAt: at("2026-09-17T20:00:00Z") }),
    ]);
    expect(out.today.map((c) => c.id)).toEqual(["new-time"]);
  });

  it("counts a booking with no start time instead of dropping it silently", () => {
    const out = q([booking({ startsAt: null }), booking({ id: "timed" })]);
    expect(out.undated).toBe(1);
    expect(out.today.map((c) => c.id)).toEqual(["timed"]);
  });

  it("does not count a cancelled undated booking", () => {
    expect(q([booking({ startsAt: null, status: "canceled" })]).undated).toBe(0);
  });

  it("names the next call that has not started yet", () => {
    const out = q([
      booking({ id: "past", startsAt: at("2026-09-17T14:00:00Z") }),
      booking({ id: "next", startsAt: at("2026-09-17T18:00:00Z") }),
      booking({ id: "after", startsAt: at("2026-09-17T21:00:00Z") }),
    ]);
    expect(out.next?.id).toBe("next");
  });

  it("looks past today for the next call once the day is done", () => {
    // 6pm with nothing left today: a rep still wants tomorrow's first call.
    const out = q(
      [
        booking({ id: "earlier-today", startsAt: at("2026-09-17T14:00:00Z") }),
        booking({ id: "tomorrow", startsAt: at("2026-09-18T15:00:00Z") }),
      ],
      at("2026-09-17T23:30:00Z"),
    );
    expect(out.today.map((c) => c.id)).toEqual(["earlier-today"]);
    expect(out.next?.id).toBe("tomorrow");
  });

  it("reads a day whose calls have all happened as no next call", () => {
    const out = q([booking({ startsAt: at("2026-09-17T14:00:00Z") })]);
    expect(out.next).toBeNull();
  });

  it("counts later days separately from today", () => {
    const out = q([
      booking({ id: "today" }),
      booking({ id: "tmw", startsAt: at("2026-09-18T15:00:00Z") }),
      booking({ id: "fri", startsAt: at("2026-09-19T15:00:00Z") }),
    ]);
    expect(out.today).toHaveLength(1);
    expect(out.upcoming).toBe(2);
  });

  it("excludes a call from before today from both today and upcoming", () => {
    const out = q([booking({ startsAt: at("2026-09-16T15:00:00Z") })]);
    expect(out.today).toEqual([]);
    expect(out.upcoming).toBe(0);
    expect(out.next).toBeNull();
  });

  it("keeps a booking whose invitee has no name rather than inventing one", () => {
    const out = q([booking({ inviteeName: null, eventType: null })]);
    expect(out.today[0]).toMatchObject({ name: null, eventType: null });
  });

  it("reads an empty board as empty, not as broken", () => {
    expect(q([])).toEqual({ today: [], next: null, upcoming: 0, undated: 0 });
  });
});
