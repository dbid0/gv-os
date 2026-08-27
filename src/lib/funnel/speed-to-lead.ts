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
  /** submittedAt ?? createdAt, in epoch ms. */
  submittedAtMs: number;
}

export interface SpeedToLeadCall {
  email: string | null;
  /** When the call/dial happened, epoch ms. */
  occurredAtMs: number;
}

export interface SpeedToLeadStats {
  /** Applications that carry an email (i.e. are dialable at all). */
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

function normEmail(email: string | null): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

function median(sortedMs: number[]): number | null {
  const n = sortedMs.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedMs[mid] : (sortedMs[mid - 1] + sortedMs[mid]) / 2;
}

const MINUTE = 60_000;

export function computeSpeedToLead(
  apps: SpeedToLeadApp[],
  calls: SpeedToLeadCall[],
): SpeedToLeadStats {
  // Earliest call per email — the first time anyone dialed that lead.
  const firstCallByEmail = new Map<string, number>();
  for (const c of calls) {
    const e = normEmail(c.email);
    if (!e) continue;
    const prev = firstCallByEmail.get(e);
    if (prev === undefined || c.occurredAtMs < prev) {
      firstCallByEmail.set(e, c.occurredAtMs);
    }
  }

  const dialable = apps.filter((a) => normEmail(a.email) !== null);
  const durations: number[] = [];
  for (const a of dialable) {
    const call = firstCallByEmail.get(normEmail(a.email)!);
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
    within5: durations.filter((d) => d <= 5 * MINUTE).length,
    within20: durations.filter((d) => d <= 20 * MINUTE).length,
    over60: durations.filter((d) => d > 60 * MINUTE).length,
    slaPct: matched ? durations.filter((d) => d <= 5 * MINUTE).length / matched : null,
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
