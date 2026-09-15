/**
 * THE SOURCE FUNNEL — link clicks to closes, re-cut by where people came from.
 *
 * The attribution spine: a UTM link counts its clicks, the application form
 * captures the link's tags, and every call is a person who applied. This lines
 * those up per source (or medium, or campaign) so "YouTube description → how
 * many closes" is one row instead of a spreadsheet exercise.
 *
 * Attribution rules, each tested:
 * - A PERSON belongs to the first tag they arrived with: their earliest
 *   application carrying a value for this dimension. Someone who applied only
 *   with untagged links is "(no tag)" — an honest bucket, never guessed into a
 *   source.
 * - Calls follow the person (alias inboxes resolved). A booked person with no
 *   application at all is "(no application)".
 * - Clicks come from the UTM registry by the link's own tag. A value with no
 *   registry link (a link built elsewhere) and the untagged buckets have no
 *   click figure — null, never a claimed 0.
 * - Held / shows / no-shows / closes use the call log's outcomes exactly as the
 *   By-closer table does, so the two tables' totals agree.
 * - Every row adds up to the total line; a rate with nothing to divide is null.
 *
 * Pure: no database.
 */

import type { CallLogRow } from "@/lib/calls/call-log";
import type { AliasMap } from "@/lib/tracking/aliases";

export const SOURCE_DIMENSIONS = [
  { key: "source", label: "Source" },
  { key: "medium", label: "Medium" },
  { key: "campaign", label: "Campaign" },
] as const;

export type SourceDimension = (typeof SOURCE_DIMENSIONS)[number]["key"];

export const NO_TAG = "(no tag)";
export const NO_APPLICATION = "(no application)";

export type FunnelApplication = {
  email: string | null;
  submittedAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type FunnelLink = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  clickCount: number;
};

export type SourceRow = {
  value: string;
  /** True for the two catch-all buckets. */
  unattributed: boolean;
  /** Link clicks with this tag, or null when no registry link carries it. */
  clicks: number | null;
  /** People whose first tagged arrival was this value. */
  applicants: number;
  /** Distinct people in this bucket with a call that wasn't cancelled. */
  bookedPeople: number;
  held: number;
  shows: number;
  noShows: number;
  closes: number;
  bookRate: number | null;
  showRate: number | null;
  closeRate: number | null;
};

export type SourceFunnel = { rows: SourceRow[]; total: SourceRow };

const pickApp: Record<SourceDimension, (a: FunnelApplication) => string | null> = {
  source: (a) => a.utmSource,
  medium: (a) => a.utmMedium,
  campaign: (a) => a.utmCampaign,
};

const pickLink: Record<SourceDimension, (l: FunnelLink) => string> = {
  source: (l) => l.utmSource,
  medium: (l) => l.utmMedium,
  campaign: (l) => l.utmCampaign,
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : (num / den) * 100;

const blank = (value: string, unattributed: boolean): SourceRow => ({
  value,
  unattributed,
  clicks: null,
  applicants: 0,
  bookedPeople: 0,
  held: 0,
  shows: 0,
  noShows: 0,
  closes: 0,
  bookRate: null,
  showRate: null,
  closeRate: null,
});

export function sourceFunnel(input: {
  links: FunnelLink[];
  applications: FunnelApplication[];
  calls: CallLogRow[];
  dimension: SourceDimension;
  aliases: AliasMap;
}): SourceFunnel {
  const { dimension, aliases } = input;
  const person = (email: string | null) => {
    const e = norm(email);
    return e ? (aliases.get(e) ?? e) : null;
  };
  const rows = new Map<string, SourceRow>();
  const rowFor = (value: string, unattributed: boolean) => {
    const r = rows.get(value) ?? blank(value, unattributed);
    rows.set(value, r);
    return r;
  };

  // Each person's first tagged arrival.
  const firstTouch = new Map<string, { value: string | null }>();
  // Undated applications sort last (MAX_SAFE_INTEGER, not Infinity: two
  // undated rows must compare equal, and Infinity - Infinity is NaN).
  const submitted = (a: FunnelApplication) =>
    a.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...input.applications].sort((a, b) => submitted(a) - submitted(b));
  for (const app of ordered) {
    const who = person(app.email);
    if (!who) continue;
    const value = norm(pickApp[dimension](app)) || null;
    const seen = firstTouch.get(who);
    if (!seen) firstTouch.set(who, { value });
    else if (seen.value === null && value !== null) seen.value = value;
  }
  const bucketOf = (who: string | null) => {
    if (!who || !firstTouch.has(who))
      return { value: NO_APPLICATION, unattributed: true };
    const value = firstTouch.get(who)!.value;
    return value
      ? { value, unattributed: false }
      : { value: NO_TAG, unattributed: true };
  };

  for (const who of firstTouch.keys()) {
    const b = bucketOf(who);
    rowFor(b.value, b.unattributed).applicants += 1;
  }

  const booked = new Map<string, Set<string>>();
  for (const call of input.calls) {
    const who = person(call.inviteeEmail);
    const b = bucketOf(who);
    const row = rowFor(b.value, b.unattributed);
    if (call.state !== "cancelled" && who) {
      const set = booked.get(b.value) ?? new Set<string>();
      set.add(who);
      booked.set(b.value, set);
    }
    const held =
      call.state === "needs_outcome" ||
      (call.state === "reported" &&
        call.outcome !== null &&
        call.outcome !== "not_held");
    if (!held) continue;
    row.held += 1;
    if (call.outcome === "no_show") row.noShows += 1;
    if (call.outcome === "showed" || call.outcome === "closed") row.shows += 1;
    if (call.outcome === "closed") row.closes += 1;
  }
  for (const [value, set] of booked) rows.get(value)!.bookedPeople = set.size;

  for (const link of input.links) {
    const value = norm(pickLink[dimension](link));
    if (!value) continue;
    const row = rowFor(value, false);
    row.clicks = (row.clicks ?? 0) + link.clickCount;
  }

  const finish = (r: SourceRow): SourceRow => ({
    ...r,
    bookRate: r.value === NO_APPLICATION ? null : rate(r.bookedPeople, r.applicants),
    showRate: rate(r.shows, r.shows + r.noShows),
    closeRate: rate(r.closes, r.shows),
  });

  const list = [...rows.values()]
    .map(finish)
    .sort(
      (a, b) =>
        Number(a.unattributed) - Number(b.unattributed) ||
        b.closes - a.closes ||
        b.applicants - a.applicants ||
        (b.clicks ?? 0) - (a.clicks ?? 0) ||
        a.value.localeCompare(b.value),
    );

  const total = blank("All", true);
  for (const r of list) {
    if (r.clicks !== null) total.clicks = (total.clicks ?? 0) + r.clicks;
    total.applicants += r.applicants;
    total.held += r.held;
    total.shows += r.shows;
    total.noShows += r.noShows;
    total.closes += r.closes;
    total.bookedPeople += r.bookedPeople;
  }
  const totalRow = {
    ...total,
    bookRate: rate(
      list
        .filter((r) => r.value !== NO_APPLICATION)
        .reduce((n, r) => n + r.bookedPeople, 0),
      total.applicants,
    ),
    showRate: rate(total.shows, total.shows + total.noShows),
    closeRate: rate(total.closes, total.shows),
  };
  return { rows: list, total: totalRow };
}
