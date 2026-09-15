/**
 * THE PERSON FILTER — re-cut an offer's numbers to one closer or one setter.
 *
 * The reference product's always-visible filter row. Picking a person cuts the
 * call numbers to the calls whose end-of-call report names them (as closer or
 * as setter) and the dialling to the dials they made. Names merge exactly the
 * way calls-by-closer merges them (case, and a first name folded into the one
 * full name it can mean), so "Sam" on the filter is the same person as the
 * "Sam Carter" row in the table.
 *
 * Honest about what a person cut can't see: a call with no report yet names
 * nobody, so it leaves a person's numbers rather than being guessed into them.
 *
 * Pure: no database.
 */

import type { CallLogRow } from "@/lib/calls/call-log";
import { canonicalRepNames } from "@/lib/tracking/activity";

export type PersonDimension = "closer" | "setter";

export type PersonFilter = { by: PersonDimension; name: string };

export type PersonOptions = { closers: string[]; setters: string[] };

const namesOf = (log: CallLogRow[], by: PersonDimension): string[] =>
  log.map((r) => (by === "closer" ? r.closer : r.setter) ?? "").filter((n) => n !== "");

function canonicalList(names: string[]): string[] {
  return [...new Set(canonicalRepNames(names).values())].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Every closer and setter the offer's reports name, merged and sorted. */
export function personOptions(log: CallLogRow[]): PersonOptions {
  return {
    closers: canonicalList(namesOf(log, "closer")),
    setters: canonicalList(namesOf(log, "setter")),
  };
}

/** The URL value for a filter: "closer:Sam Carter". */
export const personParam = (f: PersonFilter): string => `${f.by}:${f.name}`;

/**
 * Read `?who=closer:Name`. Null unless the name is one of the offer's own
 * (after merging), so a stale or hand-typed link shows the whole offer rather
 * than an empty cut that reads like a bad week.
 */
export function readPersonFilter(
  raw: unknown,
  options: PersonOptions,
): PersonFilter | null {
  if (typeof raw !== "string") return null;
  const cut = raw.indexOf(":");
  if (cut < 1) return null;
  const by = raw.slice(0, cut);
  if (by !== "closer" && by !== "setter") return null;
  const wanted = raw
    .slice(cut + 1)
    .trim()
    .toLowerCase();
  const list = by === "closer" ? options.closers : options.setters;
  const name = list.find((n) => n.toLowerCase() === wanted);
  return name ? { by, name } : null;
}

/** The call-log rows whose report names this person in that seat. */
export function filterLogByPerson(log: CallLogRow[], f: PersonFilter): CallLogRow[] {
  const canonical = canonicalRepNames(namesOf(log, f.by));
  const target = f.name.toLowerCase();
  return log.filter((r) => {
    const raw = (f.by === "closer" ? r.closer : r.setter)?.trim();
    if (!raw) return false;
    return canonical.get(raw.toLowerCase())?.toLowerCase() === target;
  });
}

/**
 * The dials this person made, matching the dialler's user name to the chosen
 * name with the same merging (so "Sam" in Close finds "Sam Carter").
 */
export function filterDialsByPerson<D extends { userName: string | null }>(
  dials: D[],
  name: string,
): D[] {
  const canonical = canonicalRepNames([name, ...dials.map((d) => d.userName ?? "")]);
  const target = canonical.get(name.trim().toLowerCase());
  return dials.filter((d) => {
    const raw = d.userName?.trim();
    return raw ? canonical.get(raw.toLowerCase()) === target : false;
  });
}
