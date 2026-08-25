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
