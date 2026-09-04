import { normalizeHeading } from "@/lib/tracking/tabs";

/**
 * THE FLOOR'S ACTIVITY, FROM THE EOD FORMS.
 *
 * Every rep files an end-of-day form and the numbers land on the tracking
 * sheet: dials, contacts made, appointments set, calls showed, offers made,
 * deals closed. That is the dial-and-conversion picture a manager runs a floor
 * on, and it is already in the mirror.
 *
 * These are SELF-REPORTED, not pulled from Close. That distinction is kept
 * everywhere they are shown: a rep's own count of their dials and a dialler's
 * count of them are different measurements, and quietly labelling one as the
 * other is how a number stops meaning anything. When Close is connected its
 * figures sit BESIDE these, never on top of them.
 *
 * Pure: header matching, number reading, aggregation. No clock, no database.
 */

export const ACTIVITY_METRICS = [
  "dials",
  "contacts",
  "apptsSet",
  "pitched",
  "onCalendar",
  "showed",
  "offersMade",
  "dealsClosed",
  "dq",
  "reschedules",
  "noShowsRebooked",
  "deposits",
  "availableSlots",
] as const;

export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

/**
 * The header each metric appears under, across the three EOD forms.
 *
 * The setter form says "Dials" and the closer form says "Outbound Dials"; the
 * DM setter form prefixes everything with "#". Same measurement, three
 * spellings, so they are matched by name like every other column in the mirror.
 */
const HEADERS: Record<ActivityMetric, string[]> = {
  dials: ["dials", "outbound dials"],
  contacts: ["contacts made"],
  apptsSet: ["new appts set", "# calls booked", "calls booked"],
  pitched: ["# calls pitched", "calls pitched"],
  onCalendar: ["calls on calendar", "# calls on calendar"],
  showed: ["calls showed", "# calls showed"],
  offersMade: ["offers made"],
  dealsClosed: ["deals closed", "# deals closed"],
  dq: ["dq leads"],
  reschedules: ["reschedules"],
  noShowsRebooked: ["no-shows rebooked", "no shows rebooked"],
  deposits: ["deposits"],
  availableSlots: ["available slots"],
};

export type ActivityCounts = Partial<Record<ActivityMetric, number>>;

/**
 * A whole-number count, or null.
 *
 * Reps type prose into number fields — a live row carries
 * "Cash Collected = Still in process". A count that cannot be read is unknown,
 * and unknown must not be added to a total as zero.
 */
export function readCount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.trim().replace(/,/g, "");
  if (v === "" || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Pull the known metrics out of one EOD row's payload. */
export function readEodMetrics(payload: Record<string, string>): ActivityCounts {
  const byHeading = new Map<string, string>();
  for (const [key, value] of Object.entries(payload)) {
    byHeading.set(normalizeHeading(key), value);
  }
  const out: ActivityCounts = {};
  for (const metric of ACTIVITY_METRICS) {
    for (const heading of HEADERS[metric]) {
      const n = readCount(byHeading.get(heading));
      if (n !== null) {
        out[metric] = n;
        break;
      }
    }
  }
  return out;
}

export interface RepActivity {
  rep: string;
  /** Days this rep filed an EOD form in the window. */
  days: number;
  totals: ActivityCounts;
}

/**
 * Resolve drifting rep names to one canonical name each.
 *
 * Reps type their own name and it drifts: The Grid's setter tab carries "Yel",
 * "Yel Akot" and "yel akot" for one person. Leaving them apart splits a rep's
 * dials across three rows; merging blindly on a prefix would merge two
 * different people the first time a floor has an "Ethan Barron" and an
 * "Ethan Cole".
 *
 * So a short name folds into a longer one ONLY when it is a whole-word prefix
 * of exactly ONE of them. "Yel" resolves to "Yel Akot" because nothing else
 * starts with Yel; a bare "Ethan" on a floor with two Ethans stays on its own,
 * because which one it means is genuinely unknown.
 */
export function canonicalRepNames(names: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name === "") continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);
    // Keep the fullest spelling of an exact match.
    if (!existing || name.length > existing.length) seen.set(key, name);
  }

  const keys = [...seen.keys()];
  const out = new Map<string, string>();
  for (const key of keys) {
    const longer = keys.filter((k) => k !== key && k.startsWith(`${key} `));
    // Exactly one longer name it could belong to: safe to fold.
    out.set(
      key,
      longer.length === 1 ? (seen.get(longer[0]) ?? seen.get(key)!) : seen.get(key)!,
    );
  }
  return out;
}

/** Sum one rep's days. A metric nobody reported stays absent, not zero. */
export function aggregateActivity(
  rows: { rep: string | null; payload: Record<string, string> }[],
): RepActivity[] {
  const canonical = canonicalRepNames(rows.map((r) => r.rep ?? ""));
  const byRep = new Map<
    string,
    { rep: string; days: number; totals: ActivityCounts }
  >();

  for (const row of rows) {
    const name = row.rep?.trim();
    if (!name) continue;
    const resolved = canonical.get(name.toLowerCase()) ?? name;
    const key = resolved.toLowerCase();
    const entry = byRep.get(key) ?? { rep: resolved, days: 0, totals: {} };
    entry.days += 1;
    const metrics = readEodMetrics(row.payload);
    for (const metric of ACTIVITY_METRICS) {
      const value = metrics[metric];
      if (value === undefined) continue;
      entry.totals[metric] = (entry.totals[metric] ?? 0) + value;
    }
    byRep.set(key, entry);
  }

  return [...byRep.values()].sort(
    (a, b) =>
      (b.totals.dials ?? 0) - (a.totals.dials ?? 0) || a.rep.localeCompare(b.rep),
  );
}

/** Sum every rep into one floor total. */
export function floorTotals(reps: RepActivity[]): ActivityCounts {
  const out: ActivityCounts = {};
  for (const r of reps) {
    for (const metric of ACTIVITY_METRICS) {
      const value = r.totals[metric];
      if (value === undefined) continue;
      out[metric] = (out[metric] ?? 0) + value;
    }
  }
  return out;
}

/**
 * A rate, or null when the denominator is missing or zero.
 *
 * Null means unknown. It is never rendered as 0%, which would claim every
 * dial failed to connect rather than admitting nobody reported dialling.
 */
export function rate(numerator?: number, denominator?: number): number | null {
  if (numerator === undefined || denominator === undefined) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export interface ActivityRates {
  /** Contacts made per dial. */
  contact: number | null;
  /** Calls showed per call on the calendar. */
  show: number | null;
  /** Offers made per call showed. */
  offer: number | null;
  /** Deals closed per call showed. */
  close: number | null;
}

export function activityRates(t: ActivityCounts): ActivityRates {
  return {
    contact: rate(t.contacts, t.dials),
    show: rate(t.showed, t.onCalendar),
    offer: rate(t.offersMade, t.showed),
    close: rate(t.dealsClosed, t.showed),
  };
}

/**
 * Rep names that look like the same person typed twice.
 *
 * "Ethan baron" and "Ethan Barron" are on The Grid's EOD tabs right now — one
 * letter apart, so they are almost certainly one rep whose numbers are split
 * across two rows. This does NOT merge them: a single character is also all
 * that separates two real people, and crediting one rep with another's dials
 * is worse than showing two rows. It reports the pair so the sheet can be
 * fixed at the source, which is the only place it can be fixed correctly.
 */
export function nearDuplicateRepNames(names: string[]): [string, string][] {
  // Compare CASED-ALIKE names. "Ethan Barron" and "ethan barron" are already
  // one rep, so listing each of them against "Ethan baron" would report the
  // same problem twice and read like two separate mistakes.
  const unique = [
    ...new Map(
      names
        .map((n) => n.trim())
        .filter((n) => n !== "")
        .map((n) => [n.toLowerCase(), n] as const),
    ).values(),
  ];
  const pairs: [string, string][] = [];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const a = unique[i].toLowerCase();
      const b = unique[j].toLowerCase();
      if (a === b) continue;
      if (editDistanceWithin(a, b, 1)) pairs.push([unique[i], unique[j]]);
    }
  }
  return pairs;
}

/** True when `a` and `b` are at most `max` single-character edits apart. */
export function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > max) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= max;
}
