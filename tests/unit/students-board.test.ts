import { describe, expect, it } from "vitest";

import {
  buildStudents,
  COHORTS,
  cohortOf,
  groupByCohort,
  moneyLine,
  summarizeStudents,
  weeksSince,
  type StudentPayment,
} from "@/lib/students/board";

const NOW = new Date("2026-09-14T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function pay(extra: Partial<StudentPayment> = {}): StudentPayment {
  return {
    email: "a@x.com",
    phone: null,
    cashCents: 99_700,
    status: "succeeded",
    occurredAt: daysAgo(1),
    ...extra,
  };
}

describe("weeksSince / cohortOf", () => {
  it("counts weeks from 1, with future dates reading as week 1", () => {
    expect(weeksSince(daysAgo(0), NOW)).toBe(1);
    expect(weeksSince(daysAgo(6.9), NOW)).toBe(1);
    expect(weeksSince(daysAgo(7), NOW)).toBe(2);
    expect(weeksSince(daysAgo(30), NOW)).toBe(5);
    expect(weeksSince(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(1);
  });

  it("maps every week count to exactly one cohort", () => {
    expect(cohortOf(1)).toBe("w1");
    expect(cohortOf(4)).toBe("w4");
    expect(cohortOf(5)).toBe("m2");
    expect(cohortOf(8)).toBe("m2");
    expect(cohortOf(9)).toBe("m3");
    expect(cohortOf(12)).toBe("m3");
    expect(cohortOf(13)).toBe("later");
    expect(cohortOf(400)).toBe("later");
    expect(cohortOf(0)).toBe("w1");
    // Cohorts tile the week line with no gap and no overlap.
    for (let w = 1; w <= 60; w++) {
      expect(COHORTS.filter((c) => w >= c.fromWeek && w <= c.toWeek)).toHaveLength(1);
    }
  });
});

describe("buildStudents", () => {
  it("one card per payer: first payment anchors the week, totals add up", () => {
    const { students } = buildStudents(
      [
        pay({ occurredAt: daysAgo(20), cashCents: 50_000 }),
        pay({ occurredAt: daysAgo(3), cashCents: 50_000, name: "Ann" }),
      ],
      NOW,
    );
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      key: "e:a@x.com",
      email: "a@x.com",
      name: "Ann",
      weeksIn: 3,
      cohort: "w3",
      payments: 2,
      collectedCents: 100_000,
      refundedCents: 0,
      netCents: 100_000,
      refunded: false,
    });
    expect(students[0].firstPaidAt).toEqual(daysAgo(20));
    expect(students[0].lastPaidAt).toEqual(daysAgo(3));
  });

  it("groups two inboxes into one student through the alias map", () => {
    const aliases = new Map([["old@x.com", "a@x.com"]]);
    const { students } = buildStudents(
      [pay(), pay({ email: "old@x.com", occurredAt: daysAgo(10) })],
      NOW,
      { aliases },
    );
    expect(students).toHaveLength(1);
    expect(students[0].payments).toBe(2);
    expect(students[0].weeksIn).toBe(2);
  });

  it("refunds subtract; a full refund flags the student instead of hiding them", () => {
    const { students } = buildStudents(
      [
        pay({ email: "full@x.com", cashCents: 99_700 }),
        pay({ email: "full@x.com", cashCents: 99_700, status: "refunded" }),
        pay({ email: "part@x.com", cashCents: 99_700 }),
        pay({ email: "part@x.com", cashCents: -20_000 }),
      ],
      NOW,
    );
    const full = students.find((s) => s.email === "full@x.com")!;
    const part = students.find((s) => s.email === "part@x.com")!;
    expect(full).toMatchObject({ netCents: 0, refunded: true, payments: 1 });
    expect(part).toMatchObject({
      collectedCents: 99_700,
      refundedCents: 20_000,
      netCents: 79_700,
      refunded: false,
    });
  });

  it("failed charges, zero amounts and identity-less rows make nobody a student", () => {
    const board = buildStudents(
      [
        pay({ email: "f@x.com", status: "failed" }),
        pay({ email: "z@x.com", cashCents: 0 }),
        pay({ email: "n@x.com", cashCents: null }),
        pay({ email: null, phone: null }),
        pay({ email: "r@x.com", cashCents: 5_000, status: "refunded" }),
      ],
      NOW,
    );
    expect(board.students).toEqual([]);
    expect(board.undatedPayers).toBe(0);
  });

  it("counts payers whose money has no date instead of guessing a week", () => {
    const board = buildStudents([pay({ occurredAt: null })], NOW);
    expect(board.students).toEqual([]);
    expect(board.undatedPayers).toBe(1);
  });

  it("identifies a phone-only payer and keeps the first phone seen", () => {
    const { students } = buildStudents(
      [
        pay({ email: null, phone: "+1 (555) 010-2000" }),
        pay({ email: null, phone: "555-010-2000", occurredAt: daysAgo(2) }),
      ],
      NOW,
    );
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      key: "p:5550102000",
      email: null,
      phone: "+1 (555) 010-2000",
      name: null,
    });
  });

  it("names: longest payment name wins, else the lead record, else null", () => {
    const names = new Map([["lead@x.com", "Lead Name"]]);
    const { students } = buildStudents(
      [
        pay({ email: "a@x.com", name: "Jo" }),
        pay({ email: "a@x.com", name: "Joanna Smith" }),
        pay({ email: "a@x.com", name: "Joan" }),
        pay({ email: "lead@x.com", name: "  " }),
        pay({ email: "nobody@x.com" }),
      ],
      NOW,
      { namesByEmail: names },
    );
    const by = (e: string) => students.find((s) => s.email === e)!;
    expect(by("a@x.com").name).toBe("Joanna Smith");
    expect(by("lead@x.com").name).toBe("Lead Name");
    expect(by("nobody@x.com").name).toBeNull();
  });

  it("sorts newest starts first, ties broken by key", () => {
    const same = daysAgo(5);
    const { students } = buildStudents(
      [
        pay({ email: "old@x.com", occurredAt: daysAgo(40) }),
        pay({ email: "b@x.com", occurredAt: same }),
        pay({ email: "a@x.com", occurredAt: same }),
      ],
      NOW,
    );
    expect(students.map((s) => s.email)).toEqual(["a@x.com", "b@x.com", "old@x.com"]);
  });
});

describe("groupByCohort / summarizeStudents / moneyLine", () => {
  const { students } = buildStudents(
    [
      pay({ email: "w1@x.com", occurredAt: daysAgo(2) }),
      pay({ email: "w4@x.com", occurredAt: daysAgo(25) }),
      pay({ email: "late@x.com", occurredAt: daysAgo(200), cashCents: 10_000 }),
      pay({
        email: "late@x.com",
        occurredAt: daysAgo(199),
        cashCents: 10_000,
        status: "refunded",
      }),
    ],
    NOW,
  );

  it("returns every cohort in order, empty ones kept", () => {
    const cols = groupByCohort(students);
    expect(cols.map((c) => c.cohort.key)).toEqual(COHORTS.map((c) => c.key));
    expect(cols.find((c) => c.cohort.key === "w1")!.students).toHaveLength(1);
    expect(cols.find((c) => c.cohort.key === "w2")!.students).toHaveLength(0);
    expect(cols.find((c) => c.cohort.key === "later")!.students).toHaveLength(1);
  });

  it("summarises totals, first month and refunds", () => {
    expect(summarizeStudents(students)).toEqual({
      total: 3,
      firstMonth: 2,
      complete: 0,
      refunded: 1,
      netCents: 99_700 * 2,
    });
    expect(summarizeStudents([])).toEqual({
      total: 0,
      firstMonth: 0,
      complete: 0,
      refunded: 0,
      netCents: 0,
    });
  });

  it("writes the card money line", () => {
    expect(moneyLine({ payments: 1, netCents: 99_700 })).toBe("1 payment · $997.00");
    expect(moneyLine({ payments: 3, netCents: 150 })).toBe("3 payments · $1.50");
  });
});
