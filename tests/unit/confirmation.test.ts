import { describe, expect, it } from "vitest";

import {
  confirmedBeforeCall,
  splitByConfirmation,
  type ConfirmableCall,
} from "@/lib/crm/confirmation";

const T = (iso: string) => new Date(iso);
const NOW = T("2026-09-09T12:00:00Z");

function call(id: string, extra: Partial<ConfirmableCall> = {}): ConfirmableCall {
  return { id, startsAt: T("2026-09-09T15:00:00Z"), status: "booked", ...extra };
}

describe("confirmedBeforeCall", () => {
  it("counts only a confirmation strictly before the start", () => {
    expect(
      confirmedBeforeCall(T("2026-09-09T10:00:00Z"), T("2026-09-09T15:00:00Z")),
    ).toBe(true);
    expect(
      confirmedBeforeCall(T("2026-09-09T16:00:00Z"), T("2026-09-09T15:00:00Z")),
    ).toBe(false);
    expect(
      confirmedBeforeCall(T("2026-09-09T15:00:00Z"), T("2026-09-09T15:00:00Z")),
    ).toBe(false);
  });

  it("is false when either side is unknown", () => {
    expect(confirmedBeforeCall(null, T("2026-09-09T15:00:00Z"))).toBe(false);
    expect(confirmedBeforeCall(T("2026-09-09T10:00:00Z"), null)).toBe(false);
  });
});

describe("splitByConfirmation", () => {
  it("splits timely-confirmed from everything else", () => {
    const calls = [call("a"), call("b")];
    const split = splitByConfirmation(
      calls,
      [{ bookingId: "a", confirmedAt: T("2026-09-09T09:00:00Z") }],
      NOW,
    );
    expect(split.confirmed.map((c) => c.id)).toEqual(["a"]);
    expect(split.unconfirmed.map((c) => c.id)).toEqual(["b"]);
  });

  it("a LATE confirmation does not count", () => {
    // Confirmed after the call happened — proves nothing, stays unconfirmed.
    const split = splitByConfirmation(
      [call("a", { startsAt: T("2026-09-09T08:00:00Z") })],
      [{ bookingId: "a", confirmedAt: T("2026-09-09T09:00:00Z") }],
      NOW,
    );
    expect(split.confirmed).toEqual([]);
    expect(split.unconfirmed.map((c) => c.id)).toEqual(["a"]);
  });

  it("a call with no start time stays in the denominator as unconfirmed", () => {
    const split = splitByConfirmation(
      [call("a", { startsAt: null })],
      [{ bookingId: "a", confirmedAt: T("2026-09-09T09:00:00Z") }],
      NOW,
    );
    expect(split.unconfirmed.map((c) => c.id)).toEqual(["a"]);
  });

  it("counts confirmed-awaiting only for future booked calls", () => {
    const calls = [
      call("future", { startsAt: T("2026-09-09T18:00:00Z") }),
      call("past", { startsAt: T("2026-09-09T10:00:00Z") }),
    ];
    const confirmations = [
      { bookingId: "future", confirmedAt: T("2026-09-09T08:00:00Z") },
      { bookingId: "past", confirmedAt: T("2026-09-09T08:00:00Z") },
    ];
    const split = splitByConfirmation(calls, confirmations, NOW);
    expect(split.confirmedAwaiting).toBe(1);
    expect(split.confirmed).toHaveLength(2);
  });

  it("counts confirmed-then-cancelled — the flake signal", () => {
    const split = splitByConfirmation(
      [call("a", { status: "canceled" })],
      [{ bookingId: "a", confirmedAt: T("2026-09-09T08:00:00Z") }],
      NOW,
    );
    expect(split.confirmedThenCancelled).toBe(1);
    expect(split.confirmedAwaiting).toBe(0);
  });

  it("ignores confirmation rows with a null confirmedAt", () => {
    const split = splitByConfirmation(
      [call("a")],
      [{ bookingId: "a", confirmedAt: null }],
      NOW,
    );
    expect(split.unconfirmed.map((c) => c.id)).toEqual(["a"]);
  });

  it("handles empty inputs", () => {
    const split = splitByConfirmation([], [], NOW);
    expect(split).toEqual({
      confirmed: [],
      unconfirmed: [],
      confirmedAwaiting: 0,
      confirmedThenCancelled: 0,
    });
  });
});
