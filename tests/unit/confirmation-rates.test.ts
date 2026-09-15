import { describe, expect, it } from "vitest";

import {
  confirmationLift,
  confirmationRates,
  readEocOutcome,
  reportForBooking,
  type EocReport,
  type RateableBooking,
} from "@/lib/crm/confirmation-rates";
import { assembleOfferMetrics } from "@/lib/tracking/offer-metrics";

const NOW = new Date("2026-09-10T12:00:00Z");
const T = (iso: string) => new Date(iso);

function booking(
  id: string,
  email: string | null,
  startsAt: string | null,
  status = "booked",
): RateableBooking {
  return { id, inviteeEmail: email, startsAt: startsAt ? T(startsAt) : null, status };
}

function report(
  email: string | null,
  status: string | null,
  occurredAt: string | null,
  outcome: string | null = null,
): EocReport {
  return { email, status, outcome, occurredAt: occurredAt ? T(occurredAt) : null };
}

describe("readEocOutcome", () => {
  it("reads the closer's words into what happened", () => {
    expect(readEocOutcome("signed up - pif", null)).toBe("closed");
    expect(readEocOutcome("Closed Won", null)).toBe("closed");
    expect(readEocOutcome("No Show", null)).toBe("no_show");
    expect(readEocOutcome("no-show", null)).toBe("no_show");
    expect(readEocOutcome("didn't show", null)).toBe("no_show");
    expect(readEocOutcome("ngmi", null)).toBe("showed");
    expect(readEocOutcome("Follow Up — Strong Interest", null)).toBe("showed");
    expect(readEocOutcome("not a fit", null)).toBe("showed");
  });

  it("a rescheduled or cancelled report means the call was not held", () => {
    expect(readEocOutcome("Rescheduled", null)).toBe("not_held");
    expect(readEocOutcome("cancelled by lead", null)).toBe("not_held");
  });

  it("falls back to the outcome column, and says nothing when both are blank", () => {
    expect(readEocOutcome("  ", "no show")).toBe("no_show");
    expect(readEocOutcome(null, "closed won")).toBe("closed");
    expect(readEocOutcome(null, null)).toBeNull();
    expect(readEocOutcome(undefined, "   ")).toBeNull();
  });

  it("the status wins over the outcome column when both are filled", () => {
    expect(readEocOutcome("signed up", "no show")).toBe("closed");
  });
});

describe("reportForBooking", () => {
  const byEmail = (rows: EocReport[]) => {
    const map = new Map<string, EocReport[]>();
    for (const r of rows) {
      const key = r.email!.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  };

  it("matches case-insensitively on the invitee email", () => {
    const r = report("lead@example.com", "no show", "2026-09-05T15:00:00Z");
    expect(
      reportForBooking(
        booking("1", " Lead@Example.com ", "2026-09-05T14:00:00Z"),
        byEmail([r]),
      ),
    ).toBe(r);
  });

  it("takes the earliest report on or after the call, not a later call's report", () => {
    const first = report("a@x.com", "no show", "2026-09-05T15:00:00Z");
    const second = report("a@x.com", "signed up", "2026-09-08T15:00:00Z");
    const map = byEmail([second, first]);
    expect(reportForBooking(booking("1", "a@x.com", "2026-09-05T14:00:00Z"), map)).toBe(
      first,
    );
    expect(reportForBooking(booking("2", "a@x.com", "2026-09-08T14:00:00Z"), map)).toBe(
      second,
    );
  });

  it("keeps the earliest report whichever order the reports arrive in, first wins a tie", () => {
    const first = report("sam@example.test", "no show", "2026-09-05T15:00:00Z");
    const later = report("sam@example.test", "signed up", "2026-09-08T15:00:00Z");
    const sameTime = report("sam@example.test", "showed", "2026-09-05T15:00:00Z");
    const call = booking("1", "sam@example.test", "2026-09-05T14:00:00Z");
    // Chronological order: the later report must not displace the earlier one.
    expect(reportForBooking(call, byEmail([first, later]))).toBe(first);
    // An exact tie keeps the report seen first rather than the last one read.
    expect(reportForBooking(call, byEmail([first, sameTime]))).toBe(first);
  });

  it("accepts a report filed shortly before the call, ignores an old one", () => {
    const early = report("a@x.com", "showed", "2026-09-05T08:00:00Z");
    expect(
      reportForBooking(
        booking("1", "a@x.com", "2026-09-05T14:00:00Z"),
        byEmail([early]),
      ),
    ).toBe(early);
    const stale = report("a@x.com", "showed", "2026-09-01T08:00:00Z");
    expect(
      reportForBooking(
        booking("1", "a@x.com", "2026-09-05T14:00:00Z"),
        byEmail([stale]),
      ),
    ).toBeNull();
  });

  it("uses an undated report only when the invitee has no dated one", () => {
    const undated = report("a@x.com", "no show", null);
    expect(
      reportForBooking(
        booking("1", "a@x.com", "2026-09-05T14:00:00Z"),
        byEmail([undated]),
      ),
    ).toBe(undated);
    const dated = report("a@x.com", "signed up", "2026-09-05T15:00:00Z");
    expect(
      reportForBooking(
        booking("1", "a@x.com", "2026-09-05T14:00:00Z"),
        byEmail([undated, dated]),
      ),
    ).toBe(dated);
  });

  it("finds nothing without an email, without reports, or without a start time", () => {
    const dated = report("a@x.com", "signed up", "2026-09-05T15:00:00Z");
    expect(
      reportForBooking(booking("1", null, "2026-09-05T14:00:00Z"), byEmail([dated])),
    ).toBeNull();
    expect(
      reportForBooking(
        booking("1", "b@x.com", "2026-09-05T14:00:00Z"),
        byEmail([dated]),
      ),
    ).toBeNull();
    expect(
      reportForBooking(booking("1", "a@x.com", null), byEmail([dated])),
    ).toBeNull();
    expect(
      reportForBooking(
        booking("1", "a@x.com", "2026-09-05T14:00:00Z"),
        new Map([["a@x.com", []]]),
      ),
    ).toBeNull();
  });
});

describe("confirmationRates", () => {
  const bookings: RateableBooking[] = [
    booking("c1", "c1@x.com", "2026-09-05T14:00:00Z"), // confirmed, closed
    booking("c2", "c2@x.com", "2026-09-06T14:00:00Z"), // confirmed, showed
    booking("c3", "c3@x.com", "2026-09-07T14:00:00Z"), // confirmed, no report
    booking("u1", "u1@x.com", "2026-09-05T16:00:00Z"), // unconfirmed, no-show
    booking("u2", "u2@x.com", "2026-09-06T16:00:00Z"), // confirmed LATE → unconfirmed, showed
    booking("u3", "u3@x.com", "2026-09-07T16:00:00Z"), // unconfirmed, rescheduled
    booking("x1", "x1@x.com", "2026-09-08T16:00:00Z", "canceled"), // not held
    booking("f1", "f1@x.com", "2026-09-12T16:00:00Z"), // future, not held yet
    booking("n1", "n1@x.com", null), // no start, never held
  ];
  const confirmations = [
    { bookingId: "c1", confirmedAt: T("2026-09-05T09:00:00Z") },
    { bookingId: "c2", confirmedAt: T("2026-09-06T09:00:00Z") },
    { bookingId: "c3", confirmedAt: T("2026-09-07T09:00:00Z") },
    { bookingId: "u2", confirmedAt: T("2026-09-06T18:00:00Z") }, // after the call
    { bookingId: "x1", confirmedAt: T("2026-09-08T09:00:00Z") },
  ];
  const reports: EocReport[] = [
    report("c1@x.com", "signed up - pif", "2026-09-05T15:00:00Z"),
    report("c2@x.com", "follow up", "2026-09-06T15:00:00Z"),
    report("u1@x.com", "no show", "2026-09-05T17:00:00Z"),
    report("u2@x.com", "not interested", "2026-09-06T17:00:00Z"),
    report("u3@x.com", "rescheduled", "2026-09-07T17:00:00Z"),
    report(null, "signed up", "2026-09-07T17:00:00Z"), // no email: unusable
  ];

  it("splits held, reported calls into confirmed vs not with named denominators", () => {
    const r = confirmationRates(bookings, confirmations, reports, NOW);
    expect(r.confirmed).toEqual({
      held: 3,
      reported: 2,
      shows: 2,
      noShows: 0,
      closes: 1,
      showRate: 100,
      closeRate: 50,
    });
    expect(r.unconfirmed).toEqual({
      held: 2,
      reported: 2,
      shows: 1,
      noShows: 1,
      closes: 0,
      showRate: 50,
      closeRate: 0,
    });
    // c3 was held with no report: counted apart, never a no-show.
    expect(r.unreported).toBe(1);
  });

  it("every rate is null, never 0%, when nothing resolved", () => {
    const r = confirmationRates(
      [booking("a", "a@x.com", "2026-09-05T14:00:00Z")],
      [],
      [],
      NOW,
    );
    expect(r.unconfirmed).toMatchObject({
      held: 1,
      reported: 0,
      showRate: null,
      closeRate: null,
    });
    expect(r.confirmed.showRate).toBeNull();
    expect(r.unreported).toBe(1);
  });

  it("close rate is null when every reported call was a no-show", () => {
    const r = confirmationRates(
      [booking("a", "a@x.com", "2026-09-05T14:00:00Z")],
      [],
      [report("a@x.com", "no show", "2026-09-05T15:00:00Z")],
      NOW,
    );
    expect(r.unconfirmed.showRate).toBe(0);
    expect(r.unconfirmed.closeRate).toBeNull();
  });
});

describe("confirmationLift", () => {
  it("is the point difference only when both sides have a rate", () => {
    expect(confirmationLift(80, 55)).toBe(25);
    expect(confirmationLift(40, 55)).toBe(-15);
    expect(confirmationLift(null, 55)).toBeNull();
    expect(confirmationLift(80, null)).toBeNull();
  });
});

describe("engine wiring", () => {
  const stl = {
    connected: false,
    medianMinutes: null,
    slaPct: null,
    measured: 0,
    applications: 0,
    everDialed: 0,
    byRep: [],
  };
  const base = {
    appDates: [],
    calls: [],
    dealRows: [],
    reportedEmails: new Set<string>(),
    stl,
  };

  it("fills the rates when reports are loaded and bookings exist", () => {
    const m = assembleOfferMetrics(
      {
        ...base,
        bookings: [
          {
            id: "a",
            inviteeName: null,
            inviteeEmail: "a@x.com",
            startsAt: T("2026-09-05T14:00:00Z"),
            status: "booked",
          },
        ],
        confirmations: [{ bookingId: "a", confirmedAt: T("2026-09-05T09:00:00Z") }],
        eocReports: [report("a@x.com", "signed up", "2026-09-05T15:00:00Z")],
      },
      NOW,
    );
    expect(m.confirmation.rates?.confirmed).toMatchObject({
      shows: 1,
      closes: 1,
      closeRate: 100,
    });
  });

  it("leaves the rates null when reports were not loaded, or there are no bookings", () => {
    const withoutReports = assembleOfferMetrics(
      {
        ...base,
        bookings: [
          {
            id: "a",
            inviteeName: null,
            inviteeEmail: "a@x.com",
            startsAt: null,
            status: "booked",
          },
        ],
        confirmations: [],
      },
      NOW,
    );
    expect(withoutReports.confirmation.rates).toBeNull();
    const withoutBookings = assembleOfferMetrics(
      { ...base, bookings: [], confirmations: [], eocReports: [] },
      NOW,
    );
    expect(withoutBookings.confirmation.rates).toBeNull();
  });
});
