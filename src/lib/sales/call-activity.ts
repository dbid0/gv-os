/**
 * Call / activity logging — pure, deterministic, and 100% covered.
 *
 * RepVision's Call Library lets a rep log every call after it happens, and those
 * logged activities feed the leaderboard's activity columns. This module is the
 * shared vocabulary and the aggregation math behind that: the disposition list,
 * the call types, the two logging modes, and the pure mapping from a logged
 * activity to the rep metrics it contributes.
 *
 * Everything here is a plain function of its inputs — no clock, no database, no
 * branding — so the counts that will one day colour a rep's row can be pinned
 * down with tests to the last branch, the same bar the money and quota modules
 * hold. Not server-only: the log form and the history view (client components)
 * import the vocabulary and the summariser too.
 */

// ---------------------------------------------------------------- Modes

/**
 * The two ways an activity is logged, mirroring RepVision's "Log a Call" vs
 * "Log a Booking". A call is a conversation that already happened; a booking is
 * an appointment that was set and has not yet resolved.
 */
export type ActivityMode = "call" | "booking";

export const ACTIVITY_MODES: readonly { key: ActivityMode; label: string }[] = [
  { key: "call", label: "Log a Call" },
  { key: "booking", label: "Log a Booking" },
];

export const ACTIVITY_MODE_KEYS: string[] = ACTIVITY_MODES.map((m) => m.key);

// ---------------------------------------------------------------- Dispositions

/** How a disposition reads at a glance: a win, progress, or a dead end. */
export type DispositionOutcome = "won" | "progress" | "lost";

export interface DispositionDef {
  key: string;
  label: string;
  outcome: DispositionOutcome;
}

/**
 * The disposition vocabulary — the outcome a rep tags on a logged activity.
 * Deliberately the exact set RepVision offers on its log form.
 */
export const DISPOSITIONS: readonly DispositionDef[] = [
  { key: "sale_closed", label: "Sale Closed", outcome: "won" },
  { key: "follow_up_booked", label: "Follow Up Booked", outcome: "progress" },
  { key: "rescheduled", label: "Rescheduled", outcome: "progress" },
  { key: "not_interested", label: "Not Interested", outcome: "lost" },
  { key: "no_show", label: "No Show", outcome: "lost" },
  { key: "dq", label: "DQ", outcome: "lost" },
  { key: "wrong_number", label: "Wrong Number", outcome: "lost" },
  { key: "bad_lead", label: "Bad Lead", outcome: "lost" },
];

export const DISPOSITION_KEYS: string[] = DISPOSITIONS.map((d) => d.key);

export function dispositionDef(key: string): DispositionDef | undefined {
  return DISPOSITIONS.find((d) => d.key === key);
}

export function dispositionLabel(key: string): string {
  return dispositionDef(key)?.label ?? key;
}

// ---------------------------------------------------------------- Call types

export type CallType = "discovery" | "close" | "follow_up";

export const CALL_TYPES: readonly { key: CallType; label: string }[] = [
  { key: "discovery", label: "Discovery" },
  { key: "close", label: "Close" },
  { key: "follow_up", label: "Follow-up" },
];

export const CALL_TYPE_KEYS: string[] = CALL_TYPES.map((c) => c.key);

export function callTypeLabel(key: string): string {
  return CALL_TYPES.find((c) => c.key === key)?.label ?? key;
}

// ---------------------------------------------------------------- Metric mapping

/**
 * The activity metrics one call-mode disposition contributes. A booking is a
 * set appointment that has not resolved, so it never contributes any of these —
 * that branch lives in the aggregator, not here.
 */
export interface DispositionMetrics {
  /** The prospect showed for the call. */
  show: boolean;
  /** The prospect was a no-show. */
  noShow: boolean;
  /** A sale closed on the call. */
  sale: boolean;
  /** A follow-up was booked off the call. */
  followUp: boolean;
}

const NO_METRICS: DispositionMetrics = {
  show: false,
  noShow: false,
  sale: false,
  followUp: false,
};

const DISPOSITION_METRICS: Record<string, DispositionMetrics> = {
  sale_closed: { show: true, noShow: false, sale: true, followUp: false },
  follow_up_booked: { show: true, noShow: false, sale: false, followUp: true },
  // A reschedule and a dead lead resolve to no on-call metrics, but they are
  // still logged calls — the count lives in the aggregator, not here.
  rescheduled: { show: false, noShow: false, sale: false, followUp: false },
  not_interested: { show: true, noShow: false, sale: false, followUp: false },
  no_show: { show: false, noShow: true, sale: false, followUp: false },
  dq: { show: true, noShow: false, sale: false, followUp: false },
  wrong_number: { show: false, noShow: false, sale: false, followUp: false },
  bad_lead: { show: false, noShow: false, sale: false, followUp: false },
};

/** The metrics a single call-mode disposition contributes. Unknown → none. */
export function dispositionMetrics(key: string): DispositionMetrics {
  return DISPOSITION_METRICS[key] ?? NO_METRICS;
}

// ---------------------------------------------------------------- Aggregation

/** The minimal shape of a logged activity the aggregation math needs. */
export interface ActivityInput {
  repId: string | null;
  mode: string;
  disposition: string;
}

export interface ActivityStats {
  logged: number;
  calls: number;
  bookings: number;
  shows: number;
  noShows: number;
  sales: number;
  followUps: number;
  /** shows ÷ (shows + noShows); null until a call resolves either way. */
  showRate: number | null;
  /** sales ÷ shows; null until at least one prospect shows. */
  closeRate: number | null;
}

export interface RepActivityStats extends ActivityStats {
  repId: string;
}

function blankStats(): ActivityStats {
  return {
    logged: 0,
    calls: 0,
    bookings: 0,
    shows: 0,
    noShows: 0,
    sales: 0,
    followUps: 0,
    showRate: null,
    closeRate: null,
  };
}

/** Fold one logged activity into a running bucket. */
function applyLog(acc: ActivityStats, log: ActivityInput): void {
  acc.logged += 1;
  if (log.mode === "booking") {
    acc.bookings += 1;
    return;
  }
  acc.calls += 1;
  const m = dispositionMetrics(log.disposition);
  if (m.show) acc.shows += 1;
  if (m.noShow) acc.noShows += 1;
  if (m.sale) acc.sales += 1;
  if (m.followUp) acc.followUps += 1;
}

/** Compute the derived rates once the counts are settled. */
function finalizeStats(acc: ActivityStats): ActivityStats {
  const resolved = acc.shows + acc.noShows;
  acc.showRate = resolved > 0 ? acc.shows / resolved : null;
  acc.closeRate = acc.shows > 0 ? acc.sales / acc.shows : null;
  return acc;
}

/** Total activity across a set of logs — the figures that lead the page. */
export function summarizeActivity(logs: ActivityInput[]): ActivityStats {
  const acc = blankStats();
  for (const log of logs) applyLog(acc, log);
  return finalizeStats(acc);
}

/**
 * The leaderboard tie-break, exported so the ordering is testable in isolation:
 * most sales first, then most shows, then most total activity.
 */
export function compareRepStats(a: RepActivityStats, b: RepActivityStats): number {
  return b.sales - a.sales || b.shows - a.shows || b.logged - a.logged;
}

/**
 * Roll logged activity up per rep, ranked. Unassigned logs (no rep) never roll
 * up to a rep — they still count in the page total via summarizeActivity.
 */
export function aggregateByRep(logs: ActivityInput[]): RepActivityStats[] {
  const byRep = new Map<string, ActivityStats>();
  for (const log of logs) {
    if (!log.repId) continue;
    let acc = byRep.get(log.repId);
    if (!acc) {
      acc = blankStats();
      byRep.set(log.repId, acc);
    }
    applyLog(acc, log);
  }
  return [...byRep.entries()]
    .map(([repId, acc]) => ({ repId, ...finalizeStats(acc) }))
    .sort(compareRepStats);
}
