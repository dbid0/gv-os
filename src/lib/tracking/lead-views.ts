/**
 * LEAD FILTERS, TAGS AND SAVED VIEWS — the Leads list cut the way a team
 * actually works it.
 *
 * A saved view is nothing but a normalized query string: the page reads its
 * filters from the URL, a view reopens a URL. So a view can never hold a filter
 * the page doesn't understand, and a link someone pastes behaves exactly like
 * the view it came from.
 *
 * Filters, all optional and combined with AND:
 * - q: the existing text search (email, name, rep);
 * - tag: leads carrying that team tag;
 * - rep: leads a rep touched, with drifting spellings merged the way the floor
 *   view merges them ("Sam" → "Sam Carter" when unambiguous);
 * - has: where the lead got to — applied, booked, applied but never booked,
 *   reported on, paid.
 *
 * Tags are slugs so one label can't split into "Hot" and "hot"; a tag on an
 * alias inbox counts for the person it was merged into.
 *
 * Pure: no database.
 */

import type { AliasMap } from "@/lib/tracking/aliases";
import { canonicalRepNames } from "@/lib/tracking/activity";
import { searchLeads, type LeadSummary } from "@/lib/tracking/leads";

export const LEAD_HAS = [
  { key: "applied", label: "Applied" },
  { key: "booked", label: "Booked a call" },
  { key: "unbooked", label: "Applied, never booked" },
  { key: "reported", label: "Had a call reported" },
  { key: "paid", label: "Paid" },
] as const;

export type LeadHas = (typeof LEAD_HAS)[number]["key"];

export type LeadFilters = {
  q: string;
  tag: string | null;
  rep: string | null;
  has: LeadHas | null;
};

export const NO_FILTERS: LeadFilters = { q: "", tag: null, rep: null, has: null };

type Params = Record<string, string | string[] | undefined>;

const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/** A tag as typed → its slug, or why it can't be one. */
export function normalizeTag(
  raw: string,
): { ok: true; tag: string } | { ok: false; error: string } {
  const tag = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (tag === "") return { ok: false, error: "Type a tag first." };
  if (!TAG.test(tag)) {
    return {
      ok: false,
      error: "Tags are up to 32 letters, numbers and dashes.",
    };
  }
  return { ok: true, tag };
}

/** The filters in a Leads page URL; anything unreadable is dropped, not guessed. */
export function readLeadFilters(params: Params): LeadFilters {
  const q = first(params.q).trim().slice(0, 100);
  const tag = normalizeTag(first(params.tag));
  const rep = first(params.rep).trim().slice(0, 80);
  const has = first(params.has);
  return {
    q,
    tag: tag.ok ? tag.tag : null,
    rep: rep || null,
    has: LEAD_HAS.some((h) => h.key === has) ? (has as LeadHas) : null,
  };
}

/** The query string for a set of filters, in a fixed order; "" for none. */
export function leadFiltersQuery(f: LeadFilters): string {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.tag) q.set("tag", f.tag);
  if (f.rep) q.set("rep", f.rep);
  if (f.has) q.set("has", f.has);
  return q.toString();
}

export const isFiltered = (f: LeadFilters): boolean => leadFiltersQuery(f) !== "";

/** The filters in words, for a view's title: "Tagged hot · Paid · Rep Sam Carter". */
export function describeFilters(f: LeadFilters): string {
  const parts: string[] = [];
  if (f.has) parts.push(LEAD_HAS.find((h) => h.key === f.has)!.label);
  if (f.tag) parts.push(`Tagged ${f.tag}`);
  if (f.rep) parts.push(`Rep ${f.rep}`);
  if (f.q) parts.push(`Matching “${f.q}”`);
  return parts.length ? parts.join(" · ") : "All leads";
}

/** Tag rows → each person's tags, alias inboxes resolved, sorted, de-duplicated. */
export function tagsByLead(
  rows: { leadEmail: string; tag: string }[],
  aliases: AliasMap,
): Map<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    const email = r.leadEmail.trim().toLowerCase();
    const person = aliases.get(email) ?? email;
    const set = sets.get(person) ?? new Set<string>();
    set.add(r.tag);
    sets.set(person, set);
  }
  return new Map([...sets].map(([email, set]) => [email, [...set].sort()]));
}

/** Every tag with how many people carry it, most used first. */
export function tagUsage(
  tags: Map<string, string[]>,
): { tag: string; leads: number }[] {
  const counts = new Map<string, number>();
  for (const list of tags.values()) {
    for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, leads]) => ({ tag, leads }))
    .sort((a, b) => b.leads - a.leads || a.tag.localeCompare(b.tag));
}

/** The reps a lead list can be filtered by: merged spellings, alphabetical. */
export function repOptions(leads: LeadSummary[]): string[] {
  const canonical = canonicalRepNames(leads.flatMap((l) => l.reps));
  return [...new Set(canonical.values())].sort((a, b) => a.localeCompare(b));
}

const HAS_TEST: Record<LeadHas, (l: LeadSummary) => boolean> = {
  applied: (l) => l.applied,
  booked: (l) => l.callsBooked > 0,
  unbooked: (l) => l.applied && l.callsBooked === 0,
  reported: (l) => l.eocReports > 0,
  paid: (l) => l.paymentsCents > 0,
};

export function filterLeads(
  leads: LeadSummary[],
  f: LeadFilters,
  tags: Map<string, string[]>,
): LeadSummary[] {
  let out = searchLeads(leads, f.q);
  if (f.tag) {
    const tag = f.tag;
    out = out.filter((l) => tags.get(l.email.toLowerCase())?.includes(tag) ?? false);
  }
  if (f.rep) {
    // The wanted name joins the merge, so a rep's full name ("Sam Carter",
    // from their rep record) finds rows typed as just "Sam" when that's
    // unambiguous.
    const canonical = canonicalRepNames([...leads.flatMap((l) => l.reps), f.rep]);
    const wanted = (canonical.get(f.rep.trim().toLowerCase()) as string).toLowerCase();
    out = out.filter((l) =>
      l.reps.some((r) => {
        // Lead reps are trimmed and non-blank, so every one is in the map.
        const name = canonical.get(r.trim().toLowerCase()) as string;
        return name.toLowerCase() === wanted;
      }),
    );
  }
  if (f.has) out = out.filter(HAS_TEST[f.has]);
  return out;
}

/** A saved view's name as typed → trimmed, or why it can't be saved. */
export function validateViewName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") return { ok: false, error: "Name the view first." };
  if (name.length > 40) return { ok: false, error: "Keep the name to 40 characters." };
  return { ok: true, name };
}
