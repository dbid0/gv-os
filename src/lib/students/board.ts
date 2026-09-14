/**
 * STUDENTS — everyone who bought, boarded by how long ago they started.
 *
 * Fulfilment runs on time since purchase: week one needs onboarding, week four
 * needs a check-in, month three is where refunds and renewals get decided. So
 * the board is one card per buyer, cohorted by WEEKS SINCE THEIR FIRST
 * COLLECTED PAYMENT — the reference product's model.
 *
 * Built from the offer's dashboard payment feed (tag rules already applied, so
 * an excluded test charge never creates a student) and grouped by the SAME
 * payer identity the cash mix uses, so one person is one card here exactly
 * when they are one payer there.
 *
 * Honesty rules:
 * - A student needs at least one collected, dated payment. Payers whose money
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

export type CohortKey = "w1" | "w2" | "w3" | "w4" | "m2" | "m3" | "later";

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

export type Student = {
  /** The payer identity key (alias-resolved email, else phone). */
  key: string;
  email: string | null;
  phone: string | null;
  /** Best known name, or null — the card falls back to the email. */
  name: string | null;
  firstPaidAt: Date;
  lastPaidAt: Date;
  /** 1-based: a first payment inside the last 7 days is week 1. */
  weeksIn: number;
  cohort: CohortKey;
  /** Collected payments (count) and their cash. */
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
  /** Payers with collected money but no dated payment — unplaceable. */
  undatedPayers: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weeksSince(first: Date, now: Date): number {
  const elapsed = now.getTime() - first.getTime();
  if (elapsed < 0) return 1;
  return Math.floor(elapsed / WEEK_MS) + 1;
}

/**
 * The cohort for a week count. Weeks start at 1 and the last cohort is
 * open-ended, so every week count lands somewhere; below 1 reads as week 1.
 */
export function cohortOf(weeksIn: number): CohortKey {
  const week = Math.max(1, weeksIn);
  return COHORTS.find((c) => week >= c.fromWeek && week <= c.toWeek)!.key;
}

type Acc = {
  key: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
  payments: number;
  collectedCents: number;
  refundedCents: number;
};

const longer = (a: string | null, b: string | null | undefined): string | null => {
  const t = (b ?? "").trim();
  if (!t) return a;
  return !a || t.length > a.length ? t : a;
};

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
  } = {},
): StudentsBoard {
  const aliases = options.aliases ?? EMPTY_ALIASES;
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
      lastPaidAt: null,
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
      if (p.occurredAt) {
        if (!acc.firstPaidAt || p.occurredAt < acc.firstPaidAt)
          acc.firstPaidAt = p.occurredAt;
        if (!acc.lastPaidAt || p.occurredAt > acc.lastPaidAt)
          acc.lastPaidAt = p.occurredAt;
      }
    }
    byKey.set(key, acc);
  }

  const students: Student[] = [];
  let undatedPayers = 0;
  for (const acc of byKey.values()) {
    if (acc.collectedCents === 0) continue; // only refunds on record: not a buyer here
    if (!acc.firstPaidAt || !acc.lastPaidAt) {
      undatedPayers += 1;
      continue;
    }
    const name =
      acc.name ?? (acc.email ? (options.namesByEmail?.get(acc.email) ?? null) : null);
    const weeksIn = weeksSince(acc.firstPaidAt, now);
    const netCents = acc.collectedCents - acc.refundedCents;
    students.push({
      key: acc.key,
      email: acc.email,
      phone: acc.phone,
      name,
      firstPaidAt: acc.firstPaidAt,
      lastPaidAt: acc.lastPaidAt,
      weeksIn,
      cohort: cohortOf(weeksIn),
      payments: acc.payments,
      collectedCents: acc.collectedCents,
      refundedCents: acc.refundedCents,
      netCents,
      refunded: netCents <= 0,
    });
  }

  students.sort(
    (a, b) =>
      b.firstPaidAt.getTime() - a.firstPaidAt.getTime() || a.key.localeCompare(b.key),
  );
  return { students, undatedPayers };
}

export type CohortColumn = { cohort: Cohort; students: Student[] };

/** Every cohort in order, empty ones included — the board keeps its shape. */
export function groupByCohort(students: Student[]): CohortColumn[] {
  return COHORTS.map((cohort) => ({
    cohort,
    students: students.filter((s) => s.cohort === cohort.key),
  }));
}

export type StudentsSummary = {
  total: number;
  /** In weeks 1–4. */
  firstMonth: number;
  refunded: number;
  netCents: number;
};

export function summarizeStudents(students: Student[]): StudentsSummary {
  return {
    total: students.length,
    firstMonth: students.filter((s) => s.weeksIn <= 4).length,
    refunded: students.filter((s) => s.refunded).length,
    netCents: students.reduce((sum, s) => sum + s.netCents, 0),
  };
}

/** "3 payments · $2,991.00" — the card's money line. */
export function moneyLine(s: Pick<Student, "payments" | "netCents">): string {
  return `${s.payments} payment${s.payments === 1 ? "" : "s"} · ${formatUSD(cents(s.netCents))}`;
}
