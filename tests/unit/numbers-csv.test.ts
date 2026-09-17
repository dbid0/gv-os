import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import { callScoreboard } from "@/lib/calls/call-scoreboard";
import { dialingDetail } from "@/lib/crm/dialing-detail";
import { applicationNumbers } from "@/lib/tracking/application-numbers";
import { cashCatalog, type CashCatalog } from "@/lib/tracking/cash-catalog";
import {
  NUMBERS_CSV_HEADERS,
  numbersCsvFilename,
  numbersCsvRows,
} from "@/lib/tracking/numbers-csv";
import type { OfferNumbers } from "@/lib/tracking/numbers-loader";

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };
const SEPT = { from: "2026-09-01", to: "2026-09-30", label: "This month" };

const row = (extra: Partial<CallLogRow>): CallLogRow => ({
  bookingId: Math.random().toString(36).slice(2),
  inviteeName: null,
  inviteeEmail: "a@example.test",
  startsAt: new Date("2026-09-10T15:00:00Z"),
  eventType: null,
  provider: "calendly",
  rescheduled: false,
  state: "reported",
  confirmation: "in_time",
  confirmedRole: "dialer",
  outcome: "closed",
  outcomeWords: "signed up - pif",
  reportSource: "sheet",
  closer: null,
  setter: null,
  closeType: null,
  reportedCashCents: 150_050,
  reportedRevenueCents: 300_000,
  cancelReason: null,
  movedTo: null,
  movedFrom: null,
  ...extra,
});

/** A live offer, every section answered, built through the real engines so the
 *  export cannot drift from the numbers the page reads. */
function fullNumbers(): OfferNumbers {
  const log = [row({}), row({ outcome: "no_show", outcomeWords: "no show" })];
  return {
    bounds: ALL,
    person: null,
    personOptions: { closers: [], setters: [] },
    totalBookings: 2,
    calls: callScoreboard(log, ALL, TZ),
    cash: {
      source: "stripe",
      ticket: null,
      syncedAt: null,
      catalog: cashCatalog({
        payments: [
          {
            email: "a@example.test",
            cashCents: 150_050,
            status: "succeeded",
            occurredAt: new Date("2026-09-10T15:30:00Z"),
          },
        ],
        rules: [],
        from: new Date(0),
        to: new Date("2026-12-31T00:00:00Z"),
        timeZone: TZ,
      }),
    },
    applications: {
      numbers: applicationNumbers({
        source: "form",
        applications: [
          {
            email: "a@example.test",
            phone: null,
            submittedAt: new Date("2026-09-10T14:00:00Z"),
            formName: "Application",
            tagged: true,
          },
        ],
        calls: log,
        dials: [
          {
            email: "a@example.test",
            occurredAtMs: new Date("2026-09-10T14:04:00Z").getTime(),
          },
        ],
        bounds: ALL,
        timeZone: TZ,
      }),
      dialsConnected: true,
      capped: false,
    },
    dialing: {
      connected: true,
      capped: false,
      detail: dialingDetail(
        [
          {
            userId: "u1",
            userName: "Sam Carter",
            direction: "outbound",
            durationSeconds: 400,
            occurredAt: new Date("2026-09-10T14:04:00Z"),
            leadId: "l1",
            leadEmail: null,
            leadPhone: null,
            disposition: "answered",
          },
        ],
        TZ,
      ),
    },
  };
}

const emptyGrain = {
  n: 0,
  pickedUp: 0,
  noAnswer: 0,
  quality: 0,
  pickupRate: null,
  qualityRate: null,
};

/** An offer with nothing connected: no cash feed, no applications, no calls. */
function bareNumbers(over: Partial<OfferNumbers> = {}): OfferNumbers {
  return {
    bounds: ALL,
    person: null,
    personOptions: { closers: [], setters: [] },
    totalBookings: 0,
    calls: callScoreboard([], ALL, TZ),
    cash: { source: null, syncedAt: null, ticket: null, catalog: null },
    applications: {
      numbers: {
        source: null,
        submitted: 0,
        people: 0,
        tagged: null,
        byForm: [],
        bookedPeople: 0,
        bookRate: null,
        bookedNoApplication: 0,
        undated: 0,
        speed: {
          dialable: 0,
          matched: 0,
          neverDialled: 0,
          medianMinutes: null,
          withinSlaPct: null,
          slaMinutes: 5,
        },
      },
      dialsConnected: false,
      capped: false,
    },
    dialing: {
      connected: false,
      capped: false,
      detail: {
        total: {
          rep: "Total",
          unattributed: false,
          dial: emptyGrain,
          attempt: emptyGrain,
          person: emptyGrain,
          talkSeconds: 0,
          unmeasured: 0,
        },
        byRep: [],
        undated: 0,
      },
    },
    ...over,
  };
}

const sheetCatalog = (over: Partial<CashCatalog> = {}): CashCatalog => ({
  cashCollectedCents: 250_000,
  collectedCount: 2,
  payers: 0,
  aovCents: null,
  byDay: [{ day: "2026-09-10", cents: 250_000 }],
  byHour: Array.from({ length: 24 }, (_, h) => (h === 9 ? 250_000 : 0)),
  unplaceableHourCents: 40_000,
  byTag: [{ tag: "Core Program", cents: 250_000, count: 2 }],
  untaggedCents: 0,
  hidden: {
    count: 1,
    cents: 9_900,
    byReason: {} as CashCatalog["hidden"]["byReason"],
  },
  refundedCents: 0,
  refundedCount: 0,
  failedCount: 1,
  noCallCents: 0,
  afterFeesEstimateCents: null,
  revenueGeneratedCents: 250_000,
  leftToCollectCents: null,
  dealCount: 1,
  revenueByDay: [],
  ...over,
});

/** Lookup by "Section · Metric", the way a reader scans the sheet. */
const find = (rows: string[][], section: string, metric: string) => {
  const hit = rows.filter((r) => r[0] === section && r[1] === metric);
  expect(hit, `${section} · ${metric} should appear exactly once`).toHaveLength(1);
  return { value: hit[0][2], unit: hit[0][3], over: hit[0][4] };
};
const has = (rows: string[][], section: string, metric: string) =>
  rows.some((r) => r[0] === section && r[1] === metric);

describe("numbersCsvRows", () => {
  it("gives every row the five columns the header names", () => {
    for (const r of numbersCsvRows(fullNumbers())) {
      expect(r).toHaveLength(NUMBERS_CSV_HEADERS.length);
    }
  });

  it("writes money as plain dollars a spreadsheet can sum", () => {
    const rows = numbersCsvRows(fullNumbers());
    const cash = find(rows, "Cash", "Cash collected");
    expect(cash.value).toBe("1500.50");
    expect(cash.unit).toBe("USD");
    // No symbol, no thousands separator, nothing to strip before summing.
    for (const r of rows) {
      if (r[3] === "USD") expect(r[2]).toMatch(/^(\d+\.\d{2})?$/);
    }
  });

  it("leaves an unknown blank — never 0, never a dash", () => {
    const rows = numbersCsvRows(
      bareNumbers({
        cash: {
          source: "sheet",
          syncedAt: null,
          ticket: null,
          catalog: sheetCatalog(),
        },
      }),
    );
    // No payers, so there is no average order to state.
    expect(find(rows, "Cash", "Average order").value).toBe("");
    expect(find(rows, "Cash", "Cash after fees (estimate)").value).toBe("");
    expect(find(rows, "Cash", "Cash left to collect").value).toBe("");
    for (const r of rows) {
      expect(r[2]).not.toBe("—");
      expect(r[2]).not.toBe("null");
      expect(r[2]).not.toBe("undefined");
    }
  });

  it("names the denominator on every rate", () => {
    const rows = numbersCsvRows(fullNumbers());
    expect(find(rows, "Verdicts", "Show rate")).toMatchObject({
      value: "50.00",
      unit: "%",
      over: "2 with a verdict",
    });
    expect(find(rows, "Verdicts", "Close rate").over).toBe("1 shows");
    for (const r of rows) {
      if (r[3] === "%")
        expect(r[4], `${r[0]} · ${r[1]} needs a denominator`).not.toBe("");
    }
  });

  it("carries the window and says when it is cut to one person", () => {
    const everyone = numbersCsvRows(fullNumbers());
    expect(find(everyone, "Window", "Label").value).toBe("All time");
    expect(find(everyone, "Window", "From").value).toBe("");
    expect(find(everyone, "Window", "Cut to").value).toBe("everyone");

    const cut = numbersCsvRows({
      ...fullNumbers(),
      bounds: SEPT,
      person: { by: "closer", name: "Sam Carter" },
    });
    expect(find(cut, "Window", "From").value).toBe("2026-09-01");
    expect(find(cut, "Window", "To").value).toBe("2026-09-30");
    const who = find(cut, "Window", "Cut to");
    expect(who.value).toBe("Sam Carter (closer)");
    // The page says this out loud; a detached sheet must too.
    expect(who.over).toContain("cash and applications are the whole offer");
  });

  it("matches the engines section by section", () => {
    const rows = numbersCsvRows(fullNumbers());
    expect(find(rows, "Calls", "Booked").value).toBe("2");
    expect(find(rows, "Verdicts", "Closes").value).toBe("1");
    expect(find(rows, "Verdicts", "No-shows").value).toBe("1");
    expect(find(rows, "How closes paid", "Paid in full").value).toBe("1");
    expect(find(rows, "Money on the calls", "Cash at the call").value).toBe("1500.50");
    expect(find(rows, "Applications", "Applications").value).toBe("1");
    expect(find(rows, "Applications", "Applications").over).toBe("synced form");
    expect(find(rows, "Speed to lead", "Median").value).toBe("4");
    expect(find(rows, "Dialing", "Dials").value).toBe("1");
    expect(find(rows, "Dialing", "Talk time").value).toBe("7");
    expect(has(rows, "Dialing by rep", "Sam Carter · dials")).toBe(true);
    expect(has(rows, "Confirmation by seat", "dialer · calls")).toBe(true);
    expect(has(rows, "Cash by day", "2026-09-10")).toBe(true);
    expect(rows.some((r) => r[0] === "Cash by hour")).toBe(true);
  });

  it("breaks cash down by tag, day and hour, and keeps date-only cash out of the clock", () => {
    const rows = numbersCsvRows(
      bareNumbers({
        cash: {
          source: "sheet",
          syncedAt: null,
          ticket: null,
          catalog: sheetCatalog(),
        },
      }),
    );
    expect(find(rows, "Cash", "Cash collected").over).toBe("sheet payment log");
    expect(find(rows, "Cash by tag", "Core Program")).toMatchObject({
      value: "2500.00",
      over: "2 payments",
    });
    expect(find(rows, "Cash by hour", "09:00").value).toBe("2500.00");
    expect(find(rows, "Cash by hour", "No time of day")).toMatchObject({
      value: "400.00",
      over: "date only",
    });
    // Hours with no cash are not rows — an empty sheet is not a report.
    expect(has(rows, "Cash by hour", "00:00")).toBe(false);
  });

  it("skips a section the offer has no feed for", () => {
    const rows = numbersCsvRows(bareNumbers());
    expect(rows.every((r) => r[0] === "Window")).toBe(true);
  });

  it("blanks speed to lead when the dialler is not connected", () => {
    const base = bareNumbers();
    const rows = numbersCsvRows({
      ...base,
      applications: {
        ...base.applications,
        numbers: {
          ...base.applications.numbers,
          source: "sheet",
          submitted: 4,
          people: 4,
          tagged: null,
          speed: {
            dialable: 4,
            matched: 0,
            neverDialled: 0,
            medianMinutes: null,
            withinSlaPct: null,
            slaMinutes: 5,
          },
        },
      },
    });
    expect(find(rows, "Applications", "Applications").over).toBe(
      "sheet Applications tab",
    );
    expect(find(rows, "Applications", "UTM-tagged")).toMatchObject({
      value: "",
      over: "sheet rows carry no UTMs",
    });
    expect(find(rows, "Speed to lead", "Median").value).toBe("");
    expect(find(rows, "Speed to lead", "Within 5 minutes").value).toBe("");
  });

  it("states a rate it cannot compute as blank rather than zero", () => {
    const base = bareNumbers();
    const rows = numbersCsvRows({
      ...base,
      totalBookings: 1,
      calls: callScoreboard(
        [row({ state: "upcoming", outcome: null, outcomeWords: null })],
        ALL,
        TZ,
      ),
    });
    // One call, still ahead: nothing has happened, so no rate exists yet.
    expect(find(rows, "Verdicts", "Show rate").value).toBe("");
    expect(find(rows, "Verdicts", "Close rate").value).toBe("");
    expect(find(rows, "Calls", "Booked").value).toBe("1");
  });

  it("carries the page's footnotes so a detached sheet keeps the caveats", () => {
    const base = bareNumbers();
    const rows = numbersCsvRows({
      ...base,
      applications: {
        ...base.applications,
        capped: true,
        numbers: { ...base.applications.numbers, source: "form", undated: 3 },
      },
      dialing: {
        connected: true,
        capped: true,
        detail: {
          ...base.dialing.detail,
          total: { ...base.dialing.detail.total, unmeasured: 2 },
          undated: 5,
        },
      },
    });
    expect(has(rows, "Notes", "Applications capped")).toBe(true);
    expect(has(rows, "Notes", "Dialing capped")).toBe(true);
    expect(find(rows, "Notes", "Undated applications").value).toBe("3");
    expect(find(rows, "Notes", "Undated dials").value).toBe("5");
    expect(find(rows, "Notes", "Dials with no disposition").value).toBe("2");
  });

  it("leaves no note when nothing was capped or undated", () => {
    expect(numbersCsvRows(fullNumbers()).some((r) => r[0] === "Notes")).toBe(false);
  });
});

describe("numbersCsvFilename", () => {
  it("names the file after the offer, the window and the day it was pulled", () => {
    expect(numbersCsvFilename("client-north", "4w", "2026-09-15")).toBe(
      "numbers-client-north-4w-2026-09-15.csv",
    );
  });
});
