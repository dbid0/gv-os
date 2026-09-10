import { describe, expect, it } from "vitest";

import { filterCountedBookings } from "@/lib/bookings/counted";

const rows = [
  { provider: "calendly", id: "a" },
  { provider: "close", id: "b" },
  { provider: "Calendly", id: "c" },
];

describe("filterCountedBookings", () => {
  it("null or empty = every source counts (the single-source default)", () => {
    expect(filterCountedBookings(rows, null)).toHaveLength(3);
    expect(filterCountedBookings(rows, [])).toHaveLength(3);
    expect(filterCountedBookings(rows, undefined)).toHaveLength(3);
  });

  it("a narrowed list keeps only the counted providers, case-insensitively", () => {
    const kept = filterCountedBookings(rows, ["Calendly"]);
    expect(kept.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("a list naming an unconnected provider keeps nothing rather than guessing", () => {
    expect(filterCountedBookings(rows, ["cal.com"])).toEqual([]);
  });
});
