/**
 * THE DAILY BRIEF — the six figures Daniel opens the morning on.
 *
 * Deliberately short. The page used to carry Needs attention, Team check-ins,
 * Speed to lead and Behind on quota: four panels of prose and lists that took
 * a scroll to read and told you what you already knew. This is what he
 * actually asked for, in his order:
 *
 *   cash today · BODs in · deals yesterday · cash yesterday · calls yesterday · EODs in
 *
 * Money in, work out. Today's cash says whether the day has started; yesterday
 * says whether it finished. The two report counts say whether the team showed
 * up at both ends of it.
 *
 * Rules, same as everywhere else in this app:
 * - money is integer cents
 * - a figure nobody can answer is NULL, never 0 — "no reports expected" and
 *   "nobody filed" are different mornings and must not render the same
 * - every ratio carries its denominator, so "2" is never shown without "of 5"
 *
 * Across every offer: the brief is the agency's morning, not one client's.
 *
 * Pure: no database, no clock — the caller owns today.
 */

export interface BriefInput {
  /** Agency-wide cash rows: the day they landed on, in cents. */
  cash: { day: string; cents: number }[];
  /** Deals by the day they closed. */
  deals: { day: string }[];
  /** Calls by the day they happened. */
  calls: { day: string }[];
  /** Reports filed today vs reps expected to file. */
  bod: { submitted: number; total: number };
  eod: { submitted: number; total: number };
}

export type TileKind = "money" | "count" | "ratio";

export interface BriefTile {
  key: string;
  label: string;
  kind: TileKind;
  /** Cents for money, a plain count otherwise. Null = not knowable. */
  value: number | null;
  /** The denominator for a ratio; null for everything else. */
  of: number | null;
  /** What the figure is measured over. Empty when it needs no qualifier. */
  sub: string;
}

const sumOn = (rows: { day: string; cents: number }[], day: string) =>
  rows.filter((r) => r.day === day).reduce((n, r) => n + r.cents, 0);

const countOn = (rows: { day: string }[], day: string) =>
  rows.filter((r) => r.day === day).length;

/** The day before a yyyy-mm-dd key, across month and year boundaries. */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

const reps = (n: number) => `of ${n} ${n === 1 ? "rep" : "reps"}`;

export function dailyBrief(input: BriefInput, todayKey: string): BriefTile[] {
  const yesterdayKey = previousDayKey(todayKey);

  // A report count with nobody expected to file is not 0 out of 0 — there is
  // no question to answer, so there is no figure.
  const filed = (
    r: { submitted: number; total: number },
    label: string,
    key: string,
  ) => ({
    key,
    label,
    kind: "ratio" as const,
    value: r.total === 0 ? null : r.submitted,
    of: r.total === 0 ? null : r.total,
    sub: r.total === 0 ? "no reps on the roster" : reps(r.total),
  });

  return [
    {
      key: "cashToday",
      label: "Cash today",
      kind: "money",
      value: sumOn(input.cash, todayKey),
      of: null,
      sub: "",
    },
    filed(input.bod, "BODs in", "bods"),
    {
      key: "dealsYesterday",
      label: "Deals yesterday",
      kind: "count",
      value: countOn(input.deals, yesterdayKey),
      of: null,
      sub: "",
    },
    {
      key: "cashYesterday",
      label: "Cash yesterday",
      kind: "money",
      value: sumOn(input.cash, yesterdayKey),
      of: null,
      sub: "",
    },
    {
      key: "callsYesterday",
      label: "Calls yesterday",
      kind: "count",
      value: countOn(input.calls, yesterdayKey),
      of: null,
      sub: "",
    },
    filed(input.eod, "EODs in", "eods"),
  ];
}
