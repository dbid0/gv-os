import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import { buildAliasMap } from "@/lib/tracking/aliases";
import {
  applicationNumbers,
  NO_FORM,
  type NumbersApplication,
} from "@/lib/tracking/application-numbers";

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };
const SEPT = { from: "2026-09-01", to: "2026-09-30", label: "This month" };
const at = (iso: string) => new Date(iso);

function app(extra: Partial<NumbersApplication>): NumbersApplication {
  return {
    email: "a@example.test",
    phone: null,
    submittedAt: at("2026-09-10T15:00:00Z"),
    formName: "Application",
    tagged: false,
    ...extra,
  };
}

let n = 0;
function call(extra: Partial<CallLogRow>): CallLogRow {
  n += 1;
  return {
    bookingId: `b${n}`,
    inviteeName: null,
    inviteeEmail: "a@example.test",
    startsAt: at("2026-09-11T15:00:00Z"),
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "upcoming",
    confirmation: "none",
    confirmedRole: null,
    outcome: null,
    outcomeWords: null,
    reportSource: null,
    closer: null,
    setter: null,
    closeType: null,
    reportedCashCents: null,
    reportedRevenueCents: null,
    cancelReason: null,
    movedTo: null,
    movedFrom: null,
    ...extra,
  };
}

describe("applicationNumbers", () => {
  // September, hand-counted:
  //  A applied twice (two inboxes, one tagged) and booked       → 1 person, booked
  //  B applied (phone only), never booked
  //  C applied with no email or phone                           → its own person
  //  D applied in August (outside the window) and booked in September
  //  E booked in September, never applied                        → booked, no application
  //  F's only call was cancelled, never applied                  → not counted
  //  one undated application
  const applications: NumbersApplication[] = [
    app({ email: "a@example.test", tagged: true, formName: "VSL application" }),
    app({
      email: "a.work@example.test",
      submittedAt: at("2026-09-12T15:00:00Z"),
      formName: "VSL application",
    }),
    app({ email: null, phone: "5550102030", formName: "  " }),
    app({ email: null, phone: null, formName: null }),
    app({ email: "d@example.test", submittedAt: at("2026-08-20T15:00:00Z") }),
    app({ email: "u@example.test", submittedAt: null }),
  ];
  const calls: CallLogRow[] = [
    call({ inviteeEmail: "a.work@example.test" }),
    call({ inviteeEmail: "d@example.test" }),
    call({ inviteeEmail: "E@example.test" }),
    call({ inviteeEmail: "f@example.test", state: "cancelled" }),
    call({ inviteeEmail: null }),
  ];
  const aliases = buildAliasMap([
    { aliasEmail: "a.work@example.test", canonicalEmail: "a@example.test" },
  ]);
  const dials = [
    // A dialled 3 minutes after the first application.
    { email: "a@example.test", occurredAtMs: at("2026-09-10T15:03:00Z").getTime() },
    // B dialled by phone 30 minutes after applying.
    {
      email: null,
      phone: "5550102030",
      occurredAtMs: at("2026-09-10T15:30:00Z").getTime(),
    },
  ];

  const s = applicationNumbers({
    source: "form",
    applications,
    calls,
    dials,
    bounds: SEPT,
    timeZone: TZ,
    aliases,
  });

  it("counts the window's applications and the people behind them", () => {
    expect(s.submitted).toBe(4);
    expect(s.people).toBe(3); // A (two inboxes), B, the anonymous applicant
    expect(s.tagged).toBe(1);
    expect(s.undated).toBe(1);
  });

  it("splits by form, naming blanks", () => {
    expect(s.byForm).toEqual([
      { form: NO_FORM, count: 2 },
      { form: "VSL application", count: 2 },
    ]);
  });

  it("reads applied → booked, and booked with no application", () => {
    expect(s.bookedPeople).toBe(1); // A, through the alias
    expect(s.bookRate).toBeCloseTo((1 / 3) * 100);
    expect(s.bookedNoApplication).toBe(1); // E only: D applied in August
  });

  it("measures speed to lead on the same applications", () => {
    // Dialable: A ×2 and B. A's first app matched at 3 min; A's second app
    // (Sep 12) has no dial after it; B matched at 30 min.
    expect(s.speed).toEqual({
      dialable: 3,
      matched: 2,
      neverDialled: 1,
      medianMinutes: 17,
      withinSlaPct: 50,
      slaMinutes: 5,
    });
  });

  it("can't count UTM tags for sheet applications", () => {
    const sheet = applicationNumbers({
      source: "sheet",
      applications,
      calls,
      dials: [],
      bounds: ALL,
      timeZone: TZ,
    });
    expect(sheet.tagged).toBeNull();
    expect(sheet.submitted).toBe(5); // all time takes August too; undated never counts
    // No aliases: A's second inbox is its own person and is the one that booked.
    expect(sheet.people).toBe(5);
    expect(sheet.bookedPeople).toBe(2); // a.work + d
    expect(sheet.speed.medianMinutes).toBeNull();
    expect(sheet.speed.withinSlaPct).toBeNull();
  });

  it("is honest with nothing", () => {
    const empty = applicationNumbers({
      source: null,
      applications: [],
      calls: [],
      dials: [],
      bounds: ALL,
      timeZone: TZ,
    });
    expect(empty).toMatchObject({
      submitted: 0,
      people: 0,
      tagged: null,
      bookRate: null,
      bookedNoApplication: 0,
      byForm: [],
    });
  });
});
