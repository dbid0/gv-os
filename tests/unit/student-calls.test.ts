import { describe, expect, it } from "vitest";

import {
  callUsage,
  callsByStudent,
  heldAtFor,
  validateCallLimit,
  validateStudentCall,
} from "@/lib/students/calls";

const NOW = new Date("2026-09-14T18:00:00Z");

describe("heldAtFor", () => {
  it("puts a day at noon Central, and refuses non-dates", () => {
    expect(heldAtFor("2026-09-10")).toEqual(new Date("2026-09-10T17:00:00Z"));
    expect(heldAtFor(" 2026-09-10 ")).toEqual(new Date("2026-09-10T17:00:00Z"));
    expect(heldAtFor("2026-02-30")).toBeNull();
    expect(heldAtFor("09/10/2026")).toBeNull();
  });
});

describe("validateStudentCall", () => {
  const good = {
    studentEmail: " Student@Example.com ",
    heldOn: "2026-09-12",
    coach: "  Jordan   Rivers ",
    notes: "  Worked through the offer doc. ",
  };

  it("cleans a call", () => {
    expect(validateStudentCall(good, NOW)).toEqual({
      ok: true,
      call: {
        studentEmail: "student@example.com",
        heldAt: new Date("2026-09-12T17:00:00Z"),
        coach: "Jordan Rivers",
        notes: "Worked through the offer doc.",
      },
    });
    expect(validateStudentCall({ ...good, coach: " ", notes: "" }, NOW)).toMatchObject({
      ok: true,
      call: { coach: null, notes: null },
    });
    // Today and tomorrow (timezones) are fine.
    expect(validateStudentCall({ ...good, heldOn: "2026-09-15" }, NOW).ok).toBe(true);
  });

  it("refuses a missing student, a bad or future day, and long fields", () => {
    expect(
      validateStudentCall(
        {
          studentEmail: "nobody",
          heldOn: "soon",
          coach: "x".repeat(81),
          notes: "y".repeat(2001),
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      errors: [
        "Pick the student by their email.",
        "Pick the day the call happened.",
        "Keep the coach's name to 80 characters.",
        "Keep the notes to 2,000 characters.",
      ],
    });
    expect(validateStudentCall({ ...good, heldOn: "2026-09-20" }, NOW)).toEqual({
      ok: false,
      errors: ["Log a call once it has happened, not ahead of time."],
    });
  });
});

describe("validateCallLimit", () => {
  it("reads blank as no limit and a whole number in range as the limit", () => {
    expect(validateCallLimit("  ")).toEqual({ ok: true, limit: null });
    expect(validateCallLimit("4")).toEqual({ ok: true, limit: 4 });
    for (const bad of ["0", "521", "2.5", "four"]) {
      expect(validateCallLimit(bad).ok).toBe(false);
    }
  });
});

describe("callsByStudent", () => {
  it("counts active calls per person, alias inboxes resolved", () => {
    const counts = callsByStudent(
      [
        { studentEmail: "a@x.com" },
        { studentEmail: "A@x.com " },
        { studentEmail: "alias@y.com" },
        { studentEmail: "b@x.com" },
      ],
      new Map([["alias@y.com", "a@x.com"]]),
    );
    expect(Object.fromEntries(counts)).toEqual({ "a@x.com": 3, "b@x.com": 1 });
  });
});

describe("callUsage", () => {
  it("labels usage with and without a limit", () => {
    expect(callUsage(0, null)).toEqual({
      used: 0,
      limit: null,
      remaining: null,
      reached: false,
      label: "No 1-on-1s yet",
    });
    expect(callUsage(1, null).label).toBe("1-on-1s: 1");
    expect(callUsage(3, null).label).toBe("1-on-1s: 3");
    expect(callUsage(2, 4)).toEqual({
      used: 2,
      limit: 4,
      remaining: 2,
      reached: false,
      label: "1-on-1s: 2 of 4",
    });
    expect(callUsage(5, 4)).toMatchObject({ remaining: 0, reached: true });
    expect(callUsage(1, 1)).toMatchObject({ reached: true, label: "1-on-1s: 1 of 1" });
  });
});
