/**
 * STUDENTS — everyone who bought, boarded by how long ago they started.
 *
 * Fulfilment runs on time since purchase: week one needs onboarding, week four
 * needs a check-in, month three is where refunds and renewals get decided. So
 * the board is one card per buyer, cohorted by WEEKS SINCE THEY STARTED — the
 * reference product's model.
 *
 * Built from the offer's dashboard payment feed (tag rules already applied, so
 * an excluded test charge never creates a student) and grouped by the SAME
 * payer identity the cash mix uses, so one person is one card here exactly
 * when they are one payer there.
 *
 * Program settings (per offer, both optional):
 * - A minimum single payment makes a payer a student. An offer with a
 *   low-ticket membership beside its program keeps the board to program
 *   buyers; the week count starts at their first QUALIFYING payment, and
 *   payers who never reached the minimum are counted, not shown as students.
 * - A program length trims the week columns to the program and adds a
 *   "Program complete" column for everyone past it.
 *
 * Honesty rules:
 * - A student needs a collected, dated qualifying payment. Payers whose money
 *   has no date can't be placed in a week; they are counted, never guessed.
 * - Refunds subtract from what a student paid; a student whose refunds cover
 *   everything they paid is flagged refunded, not silently dropped.
 * - Failed charges never make anyone a student.
 *
 * Pure: now is passed in, no database.
 */

import { cents, formatUSD } from "@/lib/money";
import type { AliasMap } from "@/lib/tracking/aliases";
import { EMPTY_ALIASES } from "@/lib/tracking/aliases";
import { payerKeyOf, type MixPayment } from "@/lib/tracking/cash-mix";
import { classifyPayment } from "@/lib/tracking/refunds";

export type StudentPayment = MixPayment & { name?: string | null };

export type CohortKey = "w1" | "w2" | "w3" | "w4" | "m2" | "m3" | "later" | "complete";

export type Cohort = {
  key: CohortKey;
  label: string;
  hint: string;
  /** Inclusive week range, 1-based. */
  fromWeek: number;
  toWeek: number;
};

export const COHORTS: readonly Cohort[] = [
  {
    key: "w1",
    label: "Week 1",
    hint: "Just bought — onboarding",
    fromWeek: 1,
    toWeek: 1,
  },
  { key: "w2", label: "Week 2", hint: "Settling in", fromWeek: 2, toWeek: 2 },
  { key: "w3", label: "Week 3", hint: "First results window", fromWeek: 3, toWeek: 3 },
  { key: "w4", label: "Week 4", hint: "First-month check-in", fromWeek: 4, toWeek: 4 },
  { key: "m2", label: "Weeks 5–8", hint: "Month two", fromWeek: 5, toWeek: 8 },
  { key: "m3", label: "Weeks 9–12", hint: "Month three", fromWeek: 9, toWeek: 12 },
  {
    key: "later",
    label: "12+ weeks",
    hint: "Past the first quarter",
    fromWeek: 13,
    toWeek: Number.POSITIVE_INFINITY,
  },
];

export type ProgramSettings = {
  /** Smallest single payment that makes a payer a student; null = any. */
  minPaymentCents: number | null;
  /** Program length in weeks; null = open-ended. */
  lengthWeeks: number | null;
};

export const OPEN_PROGRAM: ProgramSettings = {
  minPaymentCents: null,
  lengthWeeks: null,
};

const rangeLabel = (from: number, to: number) =>
  from === to ? `Week ${from}` : `Weeks ${from}–${to}`;

/**
 * The board's columns for a program. Open-ended: the standard cohorts. With a
 * length: the cohorts that start inside the program, the last one trimmed to
 * the final week, then "Program complete".
 */
export function cohortsFor(lengthWeeks: number | null): Cohort[] {
  if (lengthWeeks === null) return [...COHORTS];
  const inside = COHORTS.filter((c) => c.fromWeek <= lengthWeeks).map((c) => {
    const toWeek = Math.min(c.toWeek, lengthWeeks);
    return toWeek === c.toWeek
      ? c
      : { ...c, toWeek, label: rangeLabel(c.fromWeek, toWeek) };
  });
  return [
    ...inside,
    {
      key: "complete",
      label: "Program complete",
      hint: `Past week ${lengthWeeks}`,
      fromWeek: lengthWeeks + 1,
      toWeek: Number.POSITIVE_INFINITY,
    },
  ];
}

export type Student = {
  /** The payer identity key (alias-resolved email, else phone). */
  key: string;
  email: string | null;
  phone: string | null;
  /** Best known name, or null — the card falls back to the email. */
  name: string | null;
  /** Their first collected payment of any size. */
  firstPaidAt: Date;
  /** Their first QUALIFYING payment — when they started the program. */
  startedAt: Date;
  lastPaidAt: Date;
  /** 1-based, counted from `startedAt`. */
  weeksIn: number;
  cohort: CohortKey;
  /** The program's length, or null when open-ended. */
  programWeeks: number | null;
  programComplete: boolean;
  /** Collected payments (count) and their cash — every payment, not only qualifying ones. */
  payments: number;
  collectedCents: number;
  /** Money that went back (magnitude). */
  refundedCents: number;
  /** collected − refunded. */
  netCents: number;
  /** Refunds cover everything they paid. */
  refunded: boolean;
};

export type StudentsBoard = {
  students: Student[];
  /** Qualifying payers with no dated qualifying payment — unplaceable. */
  undatedPayers: number;
  /** Payers whose payments never reached the student minimum. */
  belowMinimumPayers: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weeksSince(first: Date, now: Date): number {
  const elapsed = now.getTime() - first.getTime();
  if (elapsed < 0) return 1;
  return Math.floor(elapsed / WEEK_MS) + 1;
}

/**
 * The cohort for a week count within a program. Weeks start at 1 and the last
 * cohort is open-ended, so every week count lands somewhere; below 1 reads as
 * week 1.
 */
export function cohortOf(
  weeksIn: number,
  lengthWeeks: number | null = null,
): CohortKey {
  const week = Math.max(1, weeksIn);
  return cohortsFor(lengthWeeks).find((c) => week >= c.fromWeek && week <= c.toWeek)!
    .key;
}

type Acc = {
  key: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  firstPaidAt: Date | null;
  startedAt: Date | null;
  lastPaidAt: Date | null;
  qualifies: boolean;
  payments: number;
  collectedCents: number;
  refundedCents: number;
};

const longer = (a: string | null, b: string | null | undefined): string | null => {
  const t = (b ?? "").trim();
  if (!t) return a;
  return !a || t.length > a.length ? t : a;
};

const earlier = (a: Date | null, b: Date) => (!a || b < a ? b : a);

/**
 * One card per payer. `namesByEmail` (lowercased emails) supplies names from the
 * lead record when the payment rows carry none; the longest name seen wins, the
 * way the leads view already picks between truncated hand-typed names.
 */
export function buildStudents(
  payments: StudentPayment[],
  now: Date,
  options: {
    aliases?: AliasMap;
    namesByEmail?: Map<string, string>;
    program?: ProgramSettings;
  } = {},
): StudentsBoard {
  const aliases = options.aliases ?? EMPTY_ALIASES;
  const program = options.program ?? OPEN_PROGRAM;
  const byKey = new Map<string, Acc>();

  for (const p of payments) {
    const key = payerKeyOf(p, aliases);
    if (!key) continue;
    const outcome = classifyPayment({ cashCents: p.cashCents, status: p.status });
    if (outcome === "failed") continue;
    const amount = Math.abs(p.cashCents ?? 0);
    if (amount === 0) continue;

    const acc = byKey.get(key) ?? {
      key,
      email: key.startsWith("e:") ? key.slice(2) : null,
      phone: null,
      name: null,
      firstPaidAt: null,
      startedAt: null,
      lastPaidAt: null,
      qualifies: false,
      payments: 0,
      collectedCents: 0,
      refundedCents: 0,
    };
    acc.name = longer(acc.name, p.name);
    if (!acc.phone && p.phone) acc.phone = p.phone;

    if (outcome === "refunded") {
      acc.refundedCents += amount;
    } else {
      acc.payments += 1;
      acc.collectedCents += amount;
      const qualifying =
        program.minPaymentCents === null || amount >= program.minPaymentCents;
      if (qualifying) acc.qualifies = true;
      if (p.occurredAt) {
        acc.firstPaidAt = earlier(acc.firstPaidAt, p.occurredAt);
        if (qualifying) acc.startedAt = earlier(acc.startedAt, p.occurredAt);
        if (!acc.lastPaidAt || p.occurredAt > acc.lastPaidAt)
          acc.lastPaidAt = p.occurredAt;
      }
    }
    byKey.set(key, acc);
  }

  const students: Student[] = [];
  let undatedPayers = 0;
  let belowMinimumPayers = 0;
  for (const acc of byKey.values()) {
    if (acc.collectedCents === 0) continue; // only refunds on record: not a buyer here
    if (!acc.qualifies) {
      belowMinimumPayers += 1;
      continue;
    }
    if (!acc.startedAt || !acc.firstPaidAt || !acc.lastPaidAt) {
      undatedPayers += 1;
      continue;
    }
    const name =
      acc.name ?? (acc.email ? (options.namesByEmail?.get(acc.email) ?? null) : null);
    const weeksIn = weeksSince(acc.startedAt, now);
    const netCents = acc.collectedCents - acc.refundedCents;
    const cohort = cohortOf(weeksIn, program.lengthWeeks);
    students.push({
      key: acc.key,
      email: acc.email,
      phone: acc.phone,
      name,
      firstPaidAt: acc.firstPaidAt,
      startedAt: acc.startedAt,
      lastPaidAt: acc.lastPaidAt,
      weeksIn,
      cohort,
      programWeeks: program.lengthWeeks,
      programComplete: cohort === "complete",
      payments: acc.payments,
      collectedCents: acc.collectedCents,
      refundedCents: acc.refundedCents,
      netCents,
      refunded: netCents <= 0,
    });
  }

  students.sort(
    (a, b) =>
      b.startedAt.getTime() - a.startedAt.getTime() || a.key.localeCompare(b.key),
  );
  return { students, undatedPayers, belowMinimumPayers };
}

export type CohortColumn = { cohort: Cohort; students: Student[] };

/** Every cohort for the program in order, empty ones included — the board keeps its shape. */
export function groupByCohort(
  students: Student[],
  lengthWeeks: number | null = null,
): CohortColumn[] {
  return cohortsFor(lengthWeeks).map((cohort) => ({
    cohort,
    students: students.filter((s) => s.cohort === cohort.key),
  }));
}

export type StudentsSummary = {
  total: number;
  /** In weeks 1–4. */
  firstMonth: number;
  /** Past the program's final week (0 for an open-ended program). */
  complete: number;
  refunded: number;
  netCents: number;
};

export function summarizeStudents(students: Student[]): StudentsSummary {
  return {
    total: students.length,
    firstMonth: students.filter((s) => s.weeksIn <= 4).length,
    complete: students.filter((s) => s.programComplete).length,
    refunded: students.filter((s) => s.refunded).length,
    netCents: students.reduce((sum, s) => sum + s.netCents, 0),
  };
}

/** "3 payments · $2,991.00" — the card's money line. */
export function moneyLine(s: Pick<Student, "payments" | "netCents">): string {
  return `${s.payments} payment${s.payments === 1 ? "" : "s"} · ${formatUSD(cents(s.netCents))}`;
}

/** "wk 3 of 12", "done", or "wk 3" for an open-ended program. */
export function weekLabel(
  s: Pick<Student, "weeksIn" | "programWeeks" | "programComplete">,
): string {
  if (s.programComplete) return "done";
  return s.programWeeks === null
    ? `wk ${s.weeksIn}`
    : `wk ${s.weeksIn} of ${s.programWeeks}`;
}
