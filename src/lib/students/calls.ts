/**
 * 1-ON-1 CALLS — the coaching calls an offer owes each student, counted.
 *
 * An offer that sells "four 1-on-1 calls" has to know who has used how many,
 * or a student gets a fifth for free and another never gets their second.
 *
 * - The limit is per offer; blank means calls are logged but no limit applies.
 * - A call counts for the PERSON: logged under an alias inbox, it lands on the
 *   student it was merged into, the same way the board resolves payers.
 * - Voided calls never count (the store only hands over active ones).
 *
 * Pure: `now` is passed in; no database.
 */

import type { AliasMap } from "@/lib/tracking/aliases";

export type StudentCallInput = {
  studentEmail: string;
  /** YYYY-MM-DD, the day the call happened (Central time). */
  heldOn: string;
  coach: string;
  notes: string;
};

export type CleanStudentCall = {
  studentEmail: string;
  heldAt: Date;
  coach: string | null;
  notes: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A logged call's day → noon Central on that day (a stable instant that stays
 * on the same calendar day in any US timezone), or null for a non-date.
 */
export function heldAtFor(heldOn: string): Date | null {
  const m = DAY.exec(heldOn.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d, 17));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== mo - 1 ||
    utc.getUTCDate() !== d
  ) {
    return null;
  }
  return utc;
}

export function validateStudentCall(
  input: StudentCallInput,
  now: Date,
): { ok: true; call: CleanStudentCall } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const studentEmail = input.studentEmail.trim().toLowerCase();
  if (!EMAIL.test(studentEmail)) errors.push("Pick the student by their email.");

  const heldAt = heldAtFor(input.heldOn);
  if (!heldAt) {
    errors.push("Pick the day the call happened.");
  } else if (heldAt.getTime() > now.getTime() + 36 * 60 * 60 * 1000) {
    errors.push("Log a call once it has happened, not ahead of time.");
  }

  const coach = input.coach.trim().replace(/\s+/g, " ");
  if (coach.length > 80) errors.push("Keep the coach's name to 80 characters.");
  const notes = input.notes.trim();
  if (notes.length > 2000) errors.push("Keep the notes to 2,000 characters.");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    call: {
      studentEmail,
      heldAt: heldAt as Date,
      coach: coach || null,
      notes: notes || null,
    },
  };
}

/** The per-offer limit as typed in setup: blank = none, else 1–520 whole calls. */
export function validateCallLimit(
  raw: string,
): { ok: true; limit: number | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (v === "") return { ok: true, limit: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 520) {
    return {
      ok: false,
      error:
        "1-on-1 calls per student is a whole number from 1 to 520, or blank for no limit.",
    };
  }
  return { ok: true, limit: n };
}

/** Active calls per person (alias inboxes resolved). */
export function callsByStudent(
  rows: { studentEmail: string }[],
  aliases: AliasMap,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const email = r.studentEmail.trim().toLowerCase();
    const person = aliases.get(email) ?? email;
    out.set(person, (out.get(person) ?? 0) + 1);
  }
  return out;
}

export type CallUsage = {
  used: number;
  limit: number | null;
  /** Calls still owed, or null with no limit. */
  remaining: number | null;
  /** At or past the limit. */
  reached: boolean;
  label: string;
};

export function callUsage(used: number, limit: number | null): CallUsage {
  if (limit === null) {
    return {
      used,
      limit,
      remaining: null,
      reached: false,
      label: used === 0 ? "No 1-on-1s yet" : `1-on-1s: ${used}`,
    };
  }
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    reached: used >= limit,
    label: `1-on-1s: ${used} of ${limit}`,
  };
}
