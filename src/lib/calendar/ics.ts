/**
 * ICS (iCalendar) PARSING — how a Google Calendar reaches GV OS.
 *
 * Google offers no API-key path: its API is OAuth, which means a Cloud
 * project, a consent screen, a redirect route and refresh-token rotation, for
 * a read-only list of meetings. Every Google Calendar also publishes a private
 * "secret address in iCal format" — one URL, pasted once, revocable from
 * Google's own settings. That is a credential the existing vault already
 * handles, and it is what "connected through Integrations, entered manually"
 * actually looks like.
 *
 * What this file does NOT do is as important as what it does. It is a reader
 * for the subset of iCalendar that a person's calendar actually contains, and
 * it says so when it meets something outside that subset rather than guessing:
 *
 *   - Unfolds continuation lines (RFC 5545 folds at 75 octets).
 *   - Reads VEVENT only. VTODO, VALARM and VTIMEZONE are skipped whole, so an
 *     alarm's own DTSTART can never be mistaken for the event's.
 *   - DTSTART/DTEND, date-times (UTC and floating) and all-day DATE values.
 *   - Expands RRULE for DAILY, WEEKLY and MONTHLY with INTERVAL, COUNT, UNTIL
 *     and BYDAY, minus EXDATE. Anything else keeps its first occurrence and is
 *     COUNTED as unexpanded, because a weekly standup silently missing from a
 *     calendar is worse than a number saying one series was not understood.
 *   - A cancelled event is dropped; a series' cancelled instance is dropped
 *     through EXDATE.
 *
 * TIME ZONES: a floating or TZID-bearing local time is read as UTC. GV OS
 * shows calendar items by DAY, so an hour's drift can only matter at a day
 * boundary, and inventing a zone conversion from a TZID we cannot resolve
 * would be a confident wrong answer rather than a small one. Google's own
 * export writes UTC for timed events, which is the case that actually runs.
 *
 * Pure: no network, no clock, no database.
 */

export interface IcsEvent {
  /** The event's UID, plus its start for one instance of a series. */
  uid: string;
  summary: string | null;
  start: Date;
  /** Null when the calendar gave no end. */
  end: Date | null;
  /** A DATE-valued start: a whole day, not a time. */
  allDay: boolean;
}

export interface IcsCalendar {
  events: IcsEvent[];
  /** Recurring series whose rule this reader does not expand. */
  unexpandedSeries: number;
}

/** RFC 5545 folds long lines; a continuation starts with a space or tab. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProp(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = left.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/** A DATE (20260917) or DATE-TIME (20260917T140000Z / ...T140000). */
function parseIcsDate(value: string): { at: Date; dateOnly: boolean } | null {
  const v = value.trim();
  const dateOnly = /^\d{8}$/.test(v);
  if (dateOnly) {
    const at = new Date(Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)));
    return Number.isNaN(at.getTime()) ? null : { at, dateOnly: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return Number.isNaN(at.getTime()) ? null : { at, dateOnly: false };
}

/** Backslash escapes, per RFC 5545. */
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 24 * 60 * 60 * 1000;

interface Rule {
  freq: string;
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
}

function parseRule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const bit of value.split(";")) {
    const eq = bit.indexOf("=");
    if (eq > 0) parts[bit.slice(0, eq).toUpperCase()] = bit.slice(eq + 1);
  }
  const freq = (parts.FREQ ?? "").toUpperCase();
  if (!freq) return null;
  const interval = Number(parts.INTERVAL ?? 1);
  const count = parts.COUNT === undefined ? null : Number(parts.COUNT);
  const until = parts.UNTIL ? (parseIcsDate(parts.UNTIL)?.at ?? null) : null;
  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((d) => DAY_CODES.indexOf(d.trim().slice(-2).toUpperCase()))
    .filter((i) => i >= 0);
  return {
    freq,
    // A zero or nonsense interval would step nowhere and spin forever.
    interval: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 1,
    count: count !== null && Number.isFinite(count) && count > 0 ? count : null,
    until,
    byDay,
  };
}

/** Same clock time, moved by whole days. */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Same day-of-month and clock time, moved by whole months. */
function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/**
 * The starts of a series inside [from, to].
 *
 * Bounded twice over — by the window, by COUNT/UNTIL, and by a hard cap — so a
 * malformed rule can never produce an unbounded loop on a request thread.
 */
const MAX_OCCURRENCES = 1000;

function expand(start: Date, rule: Rule, from: Date, to: Date): Date[] | null {
  const out: Date[] = [];
  const stop = rule.until !== null && rule.until < to ? rule.until : to;

  const keep = (at: Date) => {
    if (at >= from && at <= stop) out.push(at);
  };

  if (rule.freq === "DAILY") {
    let at = start;
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      if (at > stop) break;
      if (rule.count !== null && i >= rule.count) break;
      keep(at);
      at = addDays(at, rule.interval);
    }
    return out;
  }

  if (rule.freq === "WEEKLY") {
    // BYDAY names the days inside each week; with none, the start's own day.
    const days = rule.byDay.length > 0 ? rule.byDay : [start.getUTCDay()];
    // Walk from the Sunday of the start's week so BYDAY is evaluated per week.
    let weekStart = addDays(start, -start.getUTCDay());
    let emitted = 0;
    for (let w = 0; w < MAX_OCCURRENCES; w += 1) {
      if (weekStart > stop) break;
      for (const day of [...days].sort((a, b) => a - b)) {
        const at = addDays(weekStart, day);
        // Never before the series itself began.
        if (at < start) continue;
        if (at > stop) break;
        if (rule.count !== null && emitted >= rule.count) return out;
        emitted += 1;
        keep(at);
      }
      weekStart = addDays(weekStart, 7 * rule.interval);
    }
    return out;
  }

  if (rule.freq === "MONTHLY") {
    let at = start;
    for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
      if (at > stop) break;
      if (rule.count !== null && i >= rule.count) break;
      keep(at);
      at = addMonths(at, rule.interval);
    }
    return out;
  }

  // A frequency this reader does not expand. The caller counts it and keeps
  // the first occurrence rather than dropping the series without saying so.
  return null;
}

export function parseIcs(text: string, from: Date, to: Date): IcsCalendar {
  const events: IcsEvent[] = [];
  let unexpandedSeries = 0;

  const lines = unfold(text);
  let inEvent = false;
  // Nested components (VALARM inside a VEVENT) carry their own DTSTART.
  let skipDepth = 0;
  let props: Prop[] = [];

  for (const line of lines) {
    const prop = parseProp(line);
    if (!prop) continue;

    if (prop.name === "BEGIN") {
      const kind = prop.value.trim().toUpperCase();
      if (inEvent) {
        skipDepth += 1;
      } else if (kind === "VEVENT") {
        inEvent = true;
        props = [];
      }
      continue;
    }

    if (prop.name === "END") {
      const kind = prop.value.trim().toUpperCase();
      if (skipDepth > 0) {
        skipDepth -= 1;
      } else if (inEvent && kind === "VEVENT") {
        inEvent = false;
        const built = buildEvent(props, from, to);
        events.push(...built.events);
        unexpandedSeries += built.unexpanded;
      }
      continue;
    }

    if (inEvent && skipDepth === 0) props.push(prop);
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, unexpandedSeries };
}

function buildEvent(
  props: Prop[],
  from: Date,
  to: Date,
): { events: IcsEvent[]; unexpanded: number } {
  const get = (name: string) => props.find((p) => p.name === name);
  const none = { events: [], unexpanded: 0 };

  const status = get("STATUS")?.value.trim().toUpperCase();
  if (status === "CANCELLED") return none;

  const dtstart = get("DTSTART");
  if (!dtstart) return none;
  const startParsed = parseIcsDate(dtstart.value);
  if (!startParsed) return none;

  const allDay = startParsed.dateOnly || dtstart.params.VALUE?.toUpperCase() === "DATE";
  const uid = get("UID")?.value.trim() || "";
  const summaryRaw = get("SUMMARY")?.value;
  const summary =
    summaryRaw && summaryRaw.trim() !== "" ? unescapeText(summaryRaw.trim()) : null;

  const endParsed = get("DTEND") ? parseIcsDate(get("DTEND")!.value) : null;
  // The gap start→end is what a repeat carries with it.
  const durationMs = endParsed
    ? endParsed.at.getTime() - startParsed.at.getTime()
    : null;

  const make = (start: Date): IcsEvent => ({
    uid,
    summary,
    start,
    end: durationMs === null ? null : new Date(start.getTime() + durationMs),
    allDay,
  });

  const rruleProp = get("RRULE");
  if (!rruleProp) {
    const within = startParsed.at >= from && startParsed.at <= to;
    return { events: within ? [make(startParsed.at)] : [], unexpanded: 0 };
  }

  const rule = parseRule(rruleProp.value);
  if (!rule) {
    const within = startParsed.at >= from && startParsed.at <= to;
    return { events: within ? [make(startParsed.at)] : [], unexpanded: 1 };
  }

  const starts = expand(startParsed.at, rule, from, to);
  if (starts === null) {
    const within = startParsed.at >= from && startParsed.at <= to;
    return { events: within ? [make(startParsed.at)] : [], unexpanded: 1 };
  }

  // A deleted instance of a series.
  const excluded = new Set<number>();
  for (const p of props) {
    if (p.name !== "EXDATE") continue;
    for (const one of p.value.split(",")) {
      const at = parseIcsDate(one);
      if (at) excluded.add(at.at.getTime());
    }
  }

  return {
    events: starts.filter((s) => !excluded.has(s.getTime())).map(make),
    unexpanded: 0,
  };
}
