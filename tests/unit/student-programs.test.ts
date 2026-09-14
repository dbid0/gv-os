import { describe, expect, it } from "vitest";

import {
  buildStudents,
  cohortOf,
  cohortsFor,
  COHORTS,
  groupByCohort,
  summarizeStudents,
  weekLabel,
  type StudentPayment,
} from "@/lib/students/board";
import { validateProgram } from "@/lib/students/program";

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

describe("cohortsFor", () => {
  it("is the standard board for an open-ended program", () => {
    expect(cohortsFor(null)).toEqual([...COHORTS]);
  });

  it("trims to the program and adds Program complete", () => {
    expect(cohortsFor(6).map((c) => [c.key, c.label, c.fromWeek, c.toWeek])).toEqual([
      ["w1", "Week 1", 1, 1],
      ["w2", "Week 2", 2, 2],
      ["w3", "Week 3", 3, 3],
      ["w4", "Week 4", 4, 4],
      ["m2", "Weeks 5–6", 5, 6],
      ["complete", "Program complete", 7, Number.POSITIVE_INFINITY],
    ]);
    expect(cohortsFor(5).find((c) => c.key === "m2")?.label).toBe("Week 5");
    expect(cohortsFor(12).map((c) => c.key)).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
      "m2",
      "m3",
      "complete",
    ]);
    expect(cohortsFor(26).find((c) => c.key === "later")?.label).toBe("Weeks 13–26");
    expect(cohortsFor(1).map((c) => c.key)).toEqual(["w1", "complete"]);
  });

  it("places weeks inside or past the program", () => {
    expect(cohortOf(6, 6)).toBe("m2");
    expect(cohortOf(7, 6)).toBe("complete");
    expect(cohortOf(400, 12)).toBe("complete");
    expect(cohortOf(14, null)).toBe("later");
  });
});

describe("buildStudents with a program", () => {
  const program = { minPaymentCents: 90_000, lengthWeeks: 8 };

  it("counts a payer as a student from their first qualifying payment", () => {
    const board = buildStudents(
      [
        // A member on the low-ticket plan for months, who then bought the program.
        pay({ cashCents: 4_900, occurredAt: daysAgo(120) }),
        pay({ cashCents: 4_900, occurredAt: daysAgo(90) }),
        pay({ cashCents: 99_700, occurredAt: daysAgo(10) }),
        // Only ever a member.
        pay({ email: "member@x.com", cashCents: 4_900, occurredAt: daysAgo(3) }),
        // Bought the program long ago: past the 8 weeks.
        pay({ email: "grad@x.com", cashCents: 99_700, occurredAt: daysAgo(70) }),
      ],
      NOW,
      { program },
    );
    expect(board.belowMinimumPayers).toBe(1);
    expect(board.students.map((s) => s.email)).toEqual(["a@x.com", "grad@x.com"]);
    const upgraded = board.students[0];
    expect(upgraded).toMatchObject({
      firstPaidAt: daysAgo(120),
      startedAt: daysAgo(10),
      weeksIn: 2,
      cohort: "w2",
      programWeeks: 8,
      programComplete: false,
      payments: 3,
      collectedCents: 4_900 * 2 + 99_700,
    });
    expect(board.students[1]).toMatchObject({
      weeksIn: 11,
      cohort: "complete",
      programComplete: true,
    });
    expect(summarizeStudents(board.students)).toMatchObject({ total: 2, complete: 1 });
    expect(
      groupByCohort(board.students, 8).map((c) => [c.cohort.key, c.students.length]),
    ).toEqual([
      ["w1", 0],
      ["w2", 1],
      ["w3", 0],
      ["w4", 0],
      ["m2", 0],
      ["complete", 1],
    ]);
  });

  it("an exactly-minimum payment qualifies; an undated qualifying payment is counted apart", () => {
    const board = buildStudents(
      [
        pay({ email: "exact@x.com", cashCents: 90_000 }),
        pay({ email: "undated@x.com", cashCents: 99_700, occurredAt: null }),
        pay({ email: "undated@x.com", cashCents: 4_900, occurredAt: daysAgo(5) }),
      ],
      NOW,
      { program },
    );
    expect(board.students.map((s) => s.email)).toEqual(["exact@x.com"]);
    expect(board.undatedPayers).toBe(1);
    expect(board.belowMinimumPayers).toBe(0);
  });
});

describe("weekLabel", () => {
  it("reads the week within the program, open-ended, or done", () => {
    expect(weekLabel({ weeksIn: 3, programWeeks: 12, programComplete: false })).toBe(
      "wk 3 of 12",
    );
    expect(weekLabel({ weeksIn: 3, programWeeks: null, programComplete: false })).toBe(
      "wk 3",
    );
    expect(weekLabel({ weeksIn: 14, programWeeks: 12, programComplete: true })).toBe(
      "done",
    );
  });
});

describe("validateProgram", () => {
  it("treats blanks as not set and parses dollars and weeks", () => {
    expect(validateProgram({ minPayment: " ", lengthWeeks: "" })).toEqual({
      ok: true,
      program: { minPaymentCents: null, lengthWeeks: null },
    });
    expect(validateProgram({ minPayment: "$1,997.50", lengthWeeks: "12" })).toEqual({
      ok: true,
      program: { minPaymentCents: 199_750, lengthWeeks: 12 },
    });
  });

  it("refuses non-money, zero, fractional or out-of-range values with sentences", () => {
    for (const minPayment of ["abc", "0", "-5"]) {
      const res = validateProgram({ minPayment, lengthWeeks: "" });
      expect(!res.ok && res.errors[0]).toMatch(/dollar amount above zero/);
    }
    for (const lengthWeeks of ["0", "261", "2.5", "six"]) {
      const res = validateProgram({ minPayment: "", lengthWeeks });
      expect(!res.ok && res.errors[0]).toMatch(/whole number of weeks/);
    }
    expect(validateProgram({ minPayment: "x", lengthWeeks: "x" })).toMatchObject({
      ok: false,
      errors: [expect.any(String), expect.any(String)],
    });
  });
});
