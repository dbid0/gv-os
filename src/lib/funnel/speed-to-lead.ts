import { EMPTY_ALIASES, resolveEmail, type AliasMap } from "@/lib/tracking/aliases";

/**
 * Speed to lead — the minutes between an application landing and the first dial
 * against that lead. GV's non-negotiable standard is 5 minutes, so this measures
 * the real gap for every application we can match to a logged call by email.
 *
 * Pure: given applications and calls (each already reduced to an email + an
 * epoch-ms timestamp), it returns the distribution. No dates are constructed
 * here — the caller supplies milliseconds — so it is deterministic and testable.
 */

export interface SpeedToLeadApp {
  email: string | null;
  /** Optional second join key — last-10-digit phone (see phoneKey). */
  phone?: string | null;
  /** submittedAt ?? createdAt, in epoch ms. */
  submittedAtMs: number;
}

export interface SpeedToLeadCall {
  email: string | null;
  /** Optional second join key — last-10-digit phone (see phoneKey). */
  phone?: string | null;
  /** When the call/dial happened, epoch ms. */
  occurredAtMs: number;
}

export interface SpeedToLeadStats {
  /** Applications that carry an email or phone (i.e. are joinable at all). */
  dialableApps: number;
  /** Dialable apps with a first call at or after they came in. */
  matched: number;
  /** Median minutes to first dial across matched apps (null if none). */
  medianMinutes: number | null;
  /** Dialed within 5 / 20 / over 60 minutes. */
  within5: number;
  within20: number;
  over60: number;
  /** Share dialed within 5 minutes (the GV standard); null when nothing matched. */
  slaPct: number | null;
}

function median(sortedMs: number[]): number | null {
  const n = sortedMs.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedMs[mid] : (sortedMs[mid - 1] + sortedMs[mid]) / 2;
}

const MINUTE = 60_000;

/**
 * GV's non-negotiable standard, named once. Every SLA comparison in this file
 * — the aggregate `within5` bucket below and the per-application classifier
 * further down — reads this constant rather than a repeated literal, so the
 * "5 minutes" the sales org is judged on can never drift between the two.
 */
export const SPEED_TO_LEAD_SLA_MINUTES = 5;
export const SPEED_TO_LEAD_SLA_MS = SPEED_TO_LEAD_SLA_MINUTES * MINUTE;
export const SPEED_TO_LEAD_SLA_SECONDS = SPEED_TO_LEAD_SLA_MS / 1000;

export function computeSpeedToLead(
  apps: SpeedToLeadApp[],
  calls: SpeedToLeadCall[],
  aliases: AliasMap = EMPTY_ALIASES,
): SpeedToLeadStats {
  // Earliest call per join key — the first time anyone dialed that lead.
  // Email is the primary key; the phone (last ten digits) is the FALLBACK,
  // because a floor that dials phone-only leads leaves most calls without an
  // email and the flagship metric would only ever see a sliver of the day.
  const firstCallByEmail = new Map<string, number>();
  const firstCallByPhone = new Map<string, number>();
  const keep = (map: Map<string, number>, key: string, at: number) => {
    const prev = map.get(key);
    if (prev === undefined || at < prev) map.set(key, at);
  };
  for (const c of calls) {
    const e = resolveEmail(c.email, aliases);
    if (e) keep(firstCallByEmail, e, c.occurredAtMs);
    if (c.phone) keep(firstCallByPhone, c.phone, c.occurredAtMs);
  }

  const dialable = apps.filter(
    (a) => resolveEmail(a.email, aliases) !== null || Boolean(a.phone),
  );
  const durations: number[] = [];
  for (const a of dialable) {
    const e = resolveEmail(a.email, aliases);
    // Email wins when both keys match — it is the stronger identity; the
    // phone answers only when the email finds nothing.
    const call =
      (e ? firstCallByEmail.get(e) : undefined) ??
      (a.phone ? firstCallByPhone.get(a.phone) : undefined);
    if (call === undefined) continue;
    const delta = call - a.submittedAtMs;
    // A call logged before the application isn't a speed-to-lead on it.
    if (delta < 0) continue;
    durations.push(delta);
  }
  durations.sort((x, y) => x - y);

  const matched = durations.length;
  const medMs = median(durations);
  return {
    dialableApps: dialable.length,
    matched,
    medianMinutes: medMs === null ? null : Math.round(medMs / MINUTE),
    within5: durations.filter((d) => d <= SPEED_TO_LEAD_SLA_MS).length,
    within20: durations.filter((d) => d <= 20 * MINUTE).length,
    over60: durations.filter((d) => d > 60 * MINUTE).length,
    slaPct: matched
      ? durations.filter((d) => d <= SPEED_TO_LEAD_SLA_MS).length / matched
      : null,
  };
}

/** An application tagged with the offer (client) it belongs to. */
export interface SpeedToLeadClientApp extends SpeedToLeadApp {
  clientId: string | null;
  clientName: string | null;
}

/** A logged call tagged with the offer (client) it belongs to. */
export interface SpeedToLeadClientCall extends SpeedToLeadCall {
  clientId: string | null;
  clientName: string | null;
}

/** One offer's speed-to-lead line: the agency stats plus who they belong to. */
export interface SpeedToLeadClientStats extends SpeedToLeadStats {
  clientId: string | null;
  clientName: string;
}

/**
 * The grouping key for an offer. Prefer the stable client id; fall back to a
 * normalized name so rows that only carry a name still bucket together; return
 * null for rows with no offer at all (they carry no speed-to-lead we can
 * attribute).
 */
function clientKey(clientId: string | null, clientName: string | null): string | null {
  if (clientId) return clientId;
  const n = clientName?.trim().toLowerCase();
  return n ? `name:${n}` : null;
}

/**
 * Speed to lead broken out per offer (client). Applications drive it: every
 * offer that received at least one application gets a row, and its stats reuse
 * the exact same pure `computeSpeedToLead` logic over that offer's own apps and
 * calls — a lead is only ever matched to a dial inside the same offer.
 *
 * Rows with no offer are dropped (nothing to attribute them to). Deterministic
 * order: most matched first, then most dialable, then name.
 */
export function computeSpeedToLeadByClient(
  apps: SpeedToLeadClientApp[],
  calls: SpeedToLeadClientCall[],
): SpeedToLeadClientStats[] {
  const appsByClient = new Map<string, SpeedToLeadApp[]>();
  const callsByClient = new Map<string, SpeedToLeadCall[]>();
  const nameByKey = new Map<string, string>();

  for (const a of apps) {
    const key = clientKey(a.clientId, a.clientName);
    if (key === null) continue;
    const bucket = appsByClient.get(key);
    if (bucket) bucket.push(a);
    else appsByClient.set(key, [a]);
    if (a.clientName && !nameByKey.has(key)) nameByKey.set(key, a.clientName);
  }
  for (const c of calls) {
    const key = clientKey(c.clientId, c.clientName);
    if (key === null) continue;
    const bucket = callsByClient.get(key);
    if (bucket) bucket.push(c);
    else callsByClient.set(key, [c]);
    if (c.clientName && !nameByKey.has(key)) nameByKey.set(key, c.clientName);
  }

  const groups: SpeedToLeadClientStats[] = [];
  for (const [key, clientApps] of appsByClient) {
    groups.push({
      clientId: key.startsWith("name:") ? null : key,
      clientName: nameByKey.get(key) ?? "Unassigned",
      ...computeSpeedToLead(clientApps, callsByClient.get(key) ?? []),
    });
  }

  groups.sort(
    (a, b) =>
      b.matched - a.matched ||
      b.dialableApps - a.dialableApps ||
      a.clientName.localeCompare(b.clientName),
  );
  return groups;
}

/** A dial tagged with who made it, for the per-rep cut. */
export interface SpeedToLeadRepCall extends SpeedToLeadCall {
  rep: string | null;
}

export interface RepSpeedToLead {
  rep: string;
  matched: number;
  medianMinutes: number | null;
  within5: number;
  /** within5 / matched, or null when nothing matched. */
  slaPct: number | null;
}

/**
 * Speed to lead PER REP — the accountability cut.
 *
 * Each matched application is attributed to the rep who made its FIRST dial:
 * the 5-minute standard is about who picked the lead up, and the first dial
 * is the pickup. Reps are keyed case-insensitively (sheets and diallers type
 * the same person two ways); a first dial with no rep recorded lands under
 * "Unattributed" rather than vanishing. The rows always sum to the overall
 * matched count — one engine, re-cut per rep.
 */
export function computeSpeedToLeadByRep(
  apps: SpeedToLeadApp[],
  calls: SpeedToLeadRepCall[],
  aliases: AliasMap = EMPTY_ALIASES,
): RepSpeedToLead[] {
  interface First {
    at: number;
    rep: string | null;
  }
  const keep = (
    map: Map<string, First>,
    key: string,
    at: number,
    rep: string | null,
  ) => {
    const prev = map.get(key);
    if (prev === undefined || at < prev.at) map.set(key, { at, rep });
  };
  const byEmail = new Map<string, First>();
  const byPhone = new Map<string, First>();
  for (const c of calls) {
    const email = resolveEmail(c.email ?? null, aliases);
    if (email) keep(byEmail, email, c.occurredAtMs, c.rep);
    if (c.phone) keep(byPhone, c.phone, c.occurredAtMs, c.rep);
  }

  const durationsByRep = new Map<string, { rep: string; durations: number[] }>();
  for (const a of apps) {
    const email = resolveEmail(a.email ?? null, aliases);
    const first =
      (email ? byEmail.get(email) : undefined) ??
      (a.phone ? byPhone.get(a.phone) : undefined);
    if (first === undefined) continue;
    const delta = first.at - a.submittedAtMs;
    if (delta < 0) continue;
    const repName = first.rep?.trim() || "Unattributed";
    const key = repName.toLowerCase();
    const entry = durationsByRep.get(key) ?? { rep: repName, durations: [] };
    entry.durations.push(delta);
    durationsByRep.set(key, entry);
  }

  return [...durationsByRep.values()]
    .map(({ rep, durations }) => {
      durations.sort((x, y) => x - y);
      const med = median(durations);
      const within5 = durations.filter((d) => d <= SPEED_TO_LEAD_SLA_MS).length;
      return {
        rep,
        matched: durations.length,
        medianMinutes: med === null ? null : Math.round(med / MINUTE),
        within5,
        slaPct: durations.length ? within5 / durations.length : null,
      };
    })
    .sort((a, b) => b.matched - a.matched || a.rep.localeCompare(b.rep));
}

// ---------------------------------------------------------------------------
// Live status — the operational cut. The stats above answer "how are we
// doing over the window"; this answers "which specific application is late
// RIGHT NOW", which is the question the floor needs answered every minute,
// not once a day in a report.
// ---------------------------------------------------------------------------

export type SpeedToLeadStatus = "within" | "breached" | "open";

export interface SpeedToLeadStatusApp extends SpeedToLeadApp {
  /** Echoed straight through for display — not used for matching. */
  name?: string | null;
}

/**
 * One application's speed-to-lead outcome.
 *
 * `timeToContactSec` is set only for "within" / "breached" (a contact
 * happened). `waitingSec` is set only for "open" (no valid contact yet) —
 * the elapsed time since the application landed, which is how a caller knows
 * whether an "open" row is merely on the clock (waitingSec still under the
 * SLA) or a live breach in progress (waitingSec past it — see
 * `isSpeedToLeadOverdue`).
 */
export interface SpeedToLeadClassification {
  email: string | null;
  phone: string | null;
  name: string | null;
  submittedAtMs: number;
  status: SpeedToLeadStatus;
  timeToContactSec: number | null;
  waitingSec: number | null;
}

/**
 * Classify every application as within the 5-minute SLA, breached (contacted
 * late), or still open (no contact at all yet). Pure and deterministic: the
 * caller supplies `nowMs` rather than this function reading the clock, and
 * `contacts` must already be reduced to OUTBOUND touches only (any channel —
 * call, text, or email; see `isOutboundDirection` for how a raw Close row
 * maps to that) — this function has no notion of channel or direction, only
 * identity and time.
 *
 * Matching reuses the exact same earliest-contact-per-lead logic as
 * `computeSpeedToLead` (email first, last-10-digit phone as the fallback; one
 * alias hop) so the two can never disagree about who is or isn't matched. One
 * known, accepted limitation carried over from that function: a lead's
 * EARLIEST captured contact is what gets checked against each application, so
 * if that earliest contact predates the application (see the
 * contact-before-application test) the application reads as having no valid
 * contact — a genuine LATER outbound touch to the same lead is not
 * separately searched for. On the applications this actually governs (one
 * application per lead inside the offer's own recent window) that trade-off
 * matches production behavior rather than diverging from it.
 *
 * An application with neither an email nor a phone can never be matched to
 * anything — it is returned with status "open" so it is never silently
 * dropped, but it will never leave that state no matter how much time
 * passes; callers that only want the ACTIONABLE open rows should also check
 * that the row carries an identity.
 */
export function classifySpeedToLead(
  apps: SpeedToLeadStatusApp[],
  contacts: SpeedToLeadCall[],
  nowMs: number,
  aliases: AliasMap = EMPTY_ALIASES,
): SpeedToLeadClassification[] {
  const firstContactByEmail = new Map<string, number>();
  const firstContactByPhone = new Map<string, number>();
  const keep = (map: Map<string, number>, key: string, at: number) => {
    const prev = map.get(key);
    if (prev === undefined || at < prev) map.set(key, at);
  };
  for (const c of contacts) {
    const e = resolveEmail(c.email, aliases);
    if (e) keep(firstContactByEmail, e, c.occurredAtMs);
    if (c.phone) keep(firstContactByPhone, c.phone, c.occurredAtMs);
  }

  return apps.map((a) => {
    const email = resolveEmail(a.email, aliases);
    const contact =
      (email ? firstContactByEmail.get(email) : undefined) ??
      (a.phone ? firstContactByPhone.get(a.phone) : undefined);

    // A contact exists but landed before this application — not a real
    // response to it (same rule `computeSpeedToLead` applies), so it counts
    // as no valid contact rather than a negative time-to-contact.
    const validContact = contact !== undefined && contact >= a.submittedAtMs;

    if (validContact) {
      const deltaSec = Math.round((contact - a.submittedAtMs) / 1000);
      return {
        email: a.email,
        phone: a.phone ?? null,
        name: a.name ?? null,
        submittedAtMs: a.submittedAtMs,
        status: (deltaSec <= SPEED_TO_LEAD_SLA_SECONDS
          ? "within"
          : "breached") as SpeedToLeadStatus,
        timeToContactSec: deltaSec,
        waitingSec: null,
      };
    }

    return {
      email: a.email,
      phone: a.phone ?? null,
      name: a.name ?? null,
      submittedAtMs: a.submittedAtMs,
      status: "open" as SpeedToLeadStatus,
      timeToContactSec: null,
      waitingSec: Math.max(0, Math.round((nowMs - a.submittedAtMs) / 1000)),
    };
  });
}

/**
 * An "open" row is a LIVE BREACH once it has sat past the SLA with no
 * contact — this is the number the floor should never see above zero for
 * long. A row still inside the SLA window is "open" but not yet overdue, so
 * it does not count here.
 */
export function isSpeedToLeadOverdue(row: SpeedToLeadClassification): boolean {
  return row.status === "open" && (row.waitingSec ?? 0) > SPEED_TO_LEAD_SLA_SECONDS;
}

export interface SpeedToLeadLiveSummary {
  /** Applications carrying an identity to match on (email or phone). */
  dialableApps: number;
  within: number;
  breached: number;
  /** No valid contact yet, regardless of whether the SLA has elapsed. */
  open: number;
  /** Of the open ones, how many are PAST the SLA right now. */
  overdueNow: number;
  /** within / (within + breached); null when neither has happened yet. */
  contactedSlaPct: number | null;
  /** Median seconds to first contact, across within + breached. null if none. */
  medianContactSec: number | null;
}

/**
 * Pure rollup over `classifySpeedToLead`'s output — the three numbers a
 * dashboard card needs (contacted-in-SLA share, median time to contact, live
 * breach count) plus the raw counts they're built from, so a caller never has
 * to re-derive them by hand and risk the two disagreeing.
 */
export function summarizeSpeedToLead(
  rows: SpeedToLeadClassification[],
): SpeedToLeadLiveSummary {
  const dialable = rows.filter((r) => r.email !== null || r.phone !== null);
  const contacted = dialable.filter(
    (r): r is SpeedToLeadClassification & { timeToContactSec: number } =>
      r.timeToContactSec !== null,
  );
  const within = contacted.filter((r) => r.status === "within").length;
  const breached = contacted.filter((r) => r.status === "breached").length;
  const open = dialable.filter((r) => r.status === "open").length;
  const overdueNow = dialable.filter(isSpeedToLeadOverdue).length;
  const contactMs = contacted
    .map((r) => r.timeToContactSec * 1000)
    .sort((x, y) => x - y);
  const medianMs = median(contactMs);

  return {
    dialableApps: dialable.length,
    within,
    breached,
    open,
    overdueNow,
    contactedSlaPct: contacted.length ? within / contacted.length : null,
    medianContactSec: medianMs === null ? null : medianMs / 1000,
  };
}
