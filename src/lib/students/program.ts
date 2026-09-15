/**
 * Validating an offer's student program settings as typed in the setup page.
 * Blank means "not set": any payment makes a student, the program is
 * open-ended. Pure.
 */

import { fromDollars } from "@/lib/money";
import type { ProgramSettings } from "@/lib/students/board";

export type ProgramInput = { minPayment: string; lengthWeeks: string };

export type ProgramValidation =
  { ok: true; program: ProgramSettings } | { ok: false; errors: string[] };

export function validateProgram(input: ProgramInput): ProgramValidation {
  const errors: string[] = [];
  let minPaymentCents: number | null = null;
  let lengthWeeks: number | null = null;

  const min = input.minPayment.trim();
  if (min !== "") {
    try {
      const value = fromDollars(min);
      if (value <= 0) throw new Error("not positive");
      minPaymentCents = value;
    } catch {
      errors.push(
        "Write the student minimum as a dollar amount above zero, like 1,500, or leave it blank so any payment counts.",
      );
    }
  }

  const weeks = input.lengthWeeks.trim();
  if (weeks !== "") {
    const n = Number(weeks);
    if (!Number.isInteger(n) || n < 1 || n > 260) {
      errors.push(
        "Program length is a whole number of weeks from 1 to 260, or blank for an open-ended program.",
      );
    } else {
      lengthWeeks = n;
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, program: { minPaymentCents, lengthWeeks } };
}
