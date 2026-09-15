/**
 * APPLICATION NUMBERS — the top of the funnel, in one window.
 *
 * The reference catalog's application metrics that GV OS's data supports, plus
 * speed to lead for the SAME applications (reusing the one tested
 * `computeSpeedToLead`, so the number can't drift from the CRM page's math).
 *
 * Definitions (each tested):
 * - submitted          applications whose submit time falls in the window
 * - people             distinct applicants among them (alias-resolved email, else
 *                      phone key, else the row is its own person)
 * - tagged             applications carrying any UTM tag (form applications
 *                      only; a sheet row can't carry one, so null)
 * - byForm             submitted per form name ("(no form name)" when blank)
 * - bookedPeople       window applicants with a non-cancelled booked call
 *                      (any time), matched by the same identity; bookRate =
 *                      bookedPeople ÷ people
 * - bookedNoApplication people with a non-cancelled call starting in the window
 *                      who never applied at all (any time)
 * - speed              speed to lead over the window's applications and every
 *                      outbound dial: median minutes, share within the 5-minute
 *                      standard, dialable applications, and those never dialled
 *                      after applying
 *
 * Needs data GV OS doesn't capture (so not here): started / partial /
 * qualified / disqualified applications, opt-ins, funnel labels.
 *
 * Pure: no clock, no database.
 */

import type { CallLogRow } from "@/lib/calls/call-log";
import {
  computeSpeedToLead,
  SPEED_TO_LEAD_SLA_MINUTES,
  type SpeedToLeadCall,
} from "@/lib/funnel/speed-to-lead";
import { EMPTY_ALIASES, resolveEmail, type AliasMap } from "@/lib/tracking/aliases";
import { inWindow } from "@/lib/tracking/report-window";
import type { RangeBounds } from "@/lib/transactions/homepage";

export type NumbersApplication = {
  email: string | null;
  /** Last-ten-digit phone key, when the source carries a phone. */
  phone: string | null;
  submittedAt: Date | null;
  formName: string | null;
  /** True when any UTM field is set; null when the source can't carry UTMs. */
  tagged: boolean | null;
};

export type ApplicationNumbers = {
  source: "form" | "sheet" | null;
  submitted: number;
  people: number;
  tagged: number | null;
  byForm: { form: string; count: number }[];
  bookedPeople: number;
  bookRate: number | null;
  bookedNoApplication: number;
  undated: number;
  speed: {
    dialable: number;
    matched: number;
    neverDialled: number;
    medianMinutes: number | null;
    withinSlaPct: number | null;
    slaMinutes: number;
  };
};

export const NO_FORM = "(no form name)";

export function applicationNumbers(input: {
  source: "form" | "sheet" | null;
  /** Every application the offer has (membership needs all of them). */
  applications: NumbersApplication[];
  calls: CallLogRow[];
  dials: SpeedToLeadCall[];
  bounds: RangeBounds;
  timeZone: string;
  aliases?: AliasMap;
}): ApplicationNumbers {
  const aliases = input.aliases ?? EMPTY_ALIASES;
  const personOf = (email: string | null, phone: string | null): string | null => {
    const e = resolveEmail(email, aliases);
    if (e) return `e:${e}`;
    return phone ? `p:${phone}` : null;
  };

  const everApplied = new Set<string>();
  for (const a of input.applications) {
    const key = personOf(a.email, a.phone);
    if (key) everApplied.add(key);
  }

  const booked = new Set<string>();
  for (const c of input.calls) {
    if (c.state === "cancelled") continue;
    const key = personOf(c.inviteeEmail, null);
    if (key) booked.add(key);
  }

  const windowApps = input.applications.filter(
    (a) =>
      a.submittedAt !== null && inWindow(a.submittedAt, input.bounds, input.timeZone),
  );
  const people = new Set<string>();
  const bookedPeople = new Set<string>();
  const forms = new Map<string, number>();
  windowApps.forEach((a, i) => {
    const key = personOf(a.email, a.phone);
    people.add(key ?? `row:${i}`);
    if (key && booked.has(key)) bookedPeople.add(key);
    const form = a.formName?.trim() || NO_FORM;
    forms.set(form, (forms.get(form) ?? 0) + 1);
  });

  const noApplication = new Set<string>();
  for (const c of input.calls) {
    if (
      c.state === "cancelled" ||
      !inWindow(c.startsAt, input.bounds, input.timeZone)
    ) {
      continue;
    }
    const key = personOf(c.inviteeEmail, null);
    if (key && !everApplied.has(key)) noApplication.add(key);
  }

  const stl = computeSpeedToLead(
    windowApps.map((a) => ({
      email: a.email,
      phone: a.phone,
      submittedAtMs: (a.submittedAt as Date).getTime(),
    })),
    input.dials,
    aliases,
  );

  return {
    source: input.source,
    submitted: windowApps.length,
    people: people.size,
    tagged:
      input.source === "form"
        ? windowApps.filter((a) => a.tagged === true).length
        : null,
    byForm: [...forms.entries()]
      .map(([form, count]) => ({ form, count }))
      .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
    bookedPeople: bookedPeople.size,
    bookRate: people.size === 0 ? null : (bookedPeople.size / people.size) * 100,
    bookedNoApplication: noApplication.size,
    undated: input.applications.filter((a) => a.submittedAt === null).length,
    speed: {
      dialable: stl.dialableApps,
      matched: stl.matched,
      neverDialled: stl.dialableApps - stl.matched,
      medianMinutes: stl.medianMinutes,
      withinSlaPct: stl.slaPct === null ? null : stl.slaPct * 100,
      slaMinutes: SPEED_TO_LEAD_SLA_MINUTES,
    },
  };
}
