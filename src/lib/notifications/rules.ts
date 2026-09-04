import { isFailureNote } from "@/lib/integrations/sync-note";

/**
 * Notification rules (v2 §5) — pure builders. Each rule maps captured state
 * to candidate notifications with deterministic dedupe keys, so evaluation
 * is idempotent: run it a hundred times, each alert exists once.
 */

export interface Candidate {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  clientId: string | null;
  dedupeKey: string;
}

export interface IntegrationState {
  id: string;
  provider: string;
  label: string;
  clientId: string | null;
  lastSyncAt: Date | null;
  lastSyncNote: string | null;
}

/** A connection whose last pull failed. One alert per distinct failure note. */
export function syncFailureRule(connections: IntegrationState[]): Candidate[] {
  return connections
    .filter((c) => isFailureNote(c.lastSyncNote))
    .map((c) => ({
      kind: "sync_failure",
      severity: "critical" as const,
      title: `${c.label}: sync failing`,
      body: c.lastSyncNote,
      clientId: c.clientId,
      dedupeKey: `sync-failure:${c.id}:${c.lastSyncNote ?? ""}`,
    }));
}

const STALE_AFTER_HOURS = 26;

/** A connection that has not synced in over a day. One alert per day. */
export function stalenessRule(
  connections: IntegrationState[],
  now: Date,
  todayKey: string,
): Candidate[] {
  return connections
    .filter(
      (c) =>
        c.lastSyncAt !== null &&
        now.getTime() - c.lastSyncAt.getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000,
    )
    .map((c) => ({
      kind: "integration_stale",
      severity: "warning" as const,
      title: `${c.label}: no sync in over ${STALE_AFTER_HOURS}h`,
      body: null,
      clientId: c.clientId,
      dedupeKey: `stale:${c.id}:${todayKey}`,
    }));
}

export interface DriftRunState {
  id: string;
  driftRowCount: number;
  totalAbsDriftCents: number;
}

const DRIFT_BASELINE_CENTS = 5;

/** Sheet drift above the accepted 5-cent baseline. One alert per run. */
export function driftRule(run: DriftRunState | null): Candidate[] {
  if (!run || run.totalAbsDriftCents <= DRIFT_BASELINE_CENTS) return [];
  return [
    {
      kind: "sheet_drift",
      severity: "critical",
      title: `Sheet drift: ${run.driftRowCount} rows, $${(run.totalAbsDriftCents / 100).toFixed(2)}`,
      body: "The reconciliation found NEW drift above the accepted 5-cent baseline. Open Accounting → Reconciliation.",
      clientId: null,
      dedupeKey: `drift:${run.id}`,
    },
  ];
}

export interface SpineDriftRow {
  /** Offer slug or "agency" — the book that drifted. */
  scope: string;
  /** Display name of the offer or "Agency book". */
  name: string;
  month: string;
  /** Non-zero = sources and ledger disagree by this much. */
  cashDeltaCents: number;
}

/**
 * Money Spine reconciler drift — the "can't fail unnoticed" alert. One critical
 * notification per drifting offer-month; the delta is in the dedupe key, so a
 * changed drift updates the alert and a reconciled book (no rows) clears it.
 */
export function spineDriftRule(rows: SpineDriftRow[]): Candidate[] {
  return rows
    .filter((r) => r.cashDeltaCents !== 0)
    .map((r) => ({
      kind: "spine_drift",
      severity: "critical" as const,
      title: `${r.name} ${r.month}: sources off by $${(Math.abs(r.cashDeltaCents) / 100).toFixed(2)}`,
      body: "The Money Spine reconciler found sources not matching the ledger. Open Accounting → Reconciliation.",
      clientId: null,
      dedupeKey: `spine-drift:${r.scope}:${r.month}:${r.cashDeltaCents}`,
    }));
}

export interface SignedDocState {
  externalId: string;
  name: string | null;
  clientId: string | null;
  completedAt: Date | null;
}

/** A newly signed agreement — good news travels too. One alert per doc. */
export function signedDocRule(docs: SignedDocState[]): Candidate[] {
  return docs.map((d) => ({
    kind: "agreement_signed",
    severity: "info" as const,
    title: `Agreement signed${d.name ? `: ${d.name}` : ""}`,
    body: d.completedAt
      ? `Completed ${d.completedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "America/Chicago",
        })}`
      : null,
    clientId: d.clientId,
    dedupeKey: `signed:${d.externalId}`,
  }));
}

export interface RepWellbeingState {
  repId: string;
  repName: string;
  clientId: string | null;
  teamName: string | null;
  /** The self-reported check-in score for the day, 1–5. */
  score: number;
  /** Day key, so the alert dedupes to one per rep per day. */
  dateKey: string;
}

/** Below this, a rep's daily check-in nudges their manager to reach out. */
const WELLBEING_FLOOR = 3;

/**
 * A rep who rated how they're feeling below 3 on today's EOD (Daniel's ask:
 * "if a rep puts below a three, notify the sales manager to check on them").
 * A blank / zero score is not a low score — only a real 1 or 2 fires. One
 * alert per rep per day.
 */
export function repWellbeingRule(reports: RepWellbeingState[]): Candidate[] {
  return reports
    .filter((r) => r.score >= 1 && r.score < WELLBEING_FLOOR)
    .map((r) => ({
      kind: "rep_wellbeing",
      severity: "warning" as const,
      title: `Check on ${r.repName} — low check-in today`,
      body: `${r.repName}${
        r.teamName ? ` (${r.teamName})` : ""
      } rated how they're feeling ${r.score}/5 on today's EOD. Reach out.`,
      clientId: r.clientId,
      dedupeKey: `wellbeing:${r.repId}:${r.dateKey}`,
    }));
}

export interface BodOfferState {
  clientId: string;
  slug: string;
  name: string;
  /** HH:MM 24h in the offer's timezone. */
  bodAlertTime: string;
  timezone: string;
  mtdCashCents: number;
}

/**
 * The beginning-of-day check-in (v2 §2.9, default 12:00 CT). Fires once per
 * offer per day, any evaluation at or after the alert time; the dedupe key
 * carries the day so replays are free.
 */
export function bodRule(
  offers: BodOfferState[],
  now: Date,
  todayKey: string,
): Candidate[] {
  return offers
    .filter((o) => {
      const local = new Intl.DateTimeFormat("en-US", {
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: o.timezone,
      }).format(now);
      return local >= o.bodAlertTime;
    })
    .map((o) => ({
      kind: "bod_digest",
      severity: "info" as const,
      title: `BOD — ${o.name}: $${Math.round(o.mtdCashCents / 100).toLocaleString("en-US")} month to date`,
      body: "Start-of-day check-in: review overnight applications, bookings, and yesterday's EODs.",
      clientId: o.clientId,
      dedupeKey: `bod:${o.slug}:${todayKey}`,
    }));
}

/** The clock hour (0–23) at `now` in a timezone — for time-gated reminders. */
function localHour(now: Date, timeZone = "America/Chicago"): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hourCycle: "h23",
      hour: "2-digit",
      timeZone,
    }).format(now),
  );
}

/**
 * EOD / BOD compliance for the reminder rules: how many of the team filed and
 * who is still out. Fed straight from `getEodCompliance(kind)`.
 */
export interface CheckInComplianceState {
  submitted: number;
  total: number;
  missing: string[];
}

/** Reminders don't nag before this hour in the morning (BOD). */
const BOD_REMINDER_HOUR = 10;
/** The 8 PM CT EOD sweep — Daniel's ask for a nightly missing-EOD nudge. */
const EOD_REMINDER_HOUR = 20;

/**
 * Nightly EOD sweep. At or after 8 PM CT, if anyone still hasn't filed their
 * EOD, one warning names who's out. One alert per day (the key carries the
 * day), so the cron can replay it freely and it clears itself tomorrow.
 */
export function eodReminderRule(
  compliance: CheckInComplianceState,
  now: Date,
  todayKey: string,
): Candidate[] {
  if (localHour(now) < EOD_REMINDER_HOUR) return [];
  if (compliance.missing.length === 0) return [];
  return [
    {
      kind: "eod_missing",
      severity: "warning",
      title: `EOD not in: ${compliance.missing.length} of ${compliance.total} still out`,
      body: `Missing tonight: ${compliance.missing.join(", ")}. Nudge them before the day closes.`,
      clientId: null,
      dedupeKey: `eod-missing:${todayKey}`,
    },
  ];
}

/**
 * Morning BOD nudge. From mid-morning CT on, if anyone still hasn't filed their
 * BOD check-in, one warning names who's out. One alert per day.
 */
export function bodReminderRule(
  compliance: CheckInComplianceState,
  now: Date,
  todayKey: string,
): Candidate[] {
  if (localHour(now) < BOD_REMINDER_HOUR) return [];
  if (compliance.missing.length === 0) return [];
  return [
    {
      kind: "bod_missing",
      severity: "warning",
      title: `BOD not in: ${compliance.missing.length} of ${compliance.total} still out`,
      body: `Missing this morning: ${compliance.missing.join(", ")}. Get everyone checked in.`,
      clientId: null,
      dedupeKey: `bod-missing:${todayKey}`,
    },
  ];
}

/** A call the read says a manager should look at. */
export interface CallReviewState {
  recordingId: string;
  clientId: string | null;
  rep: string | null;
  /** One line naming why it is in the queue. */
  reason: string;
  /** Higher = more recoverable. Only the top band is severe enough to ping. */
  priority: number;
}

/**
 * A ping per call that needs the sales manager.
 *
 * One alert per RECORDING, deduped on its id, so re-evaluating never
 * double-pings and each call keeps its own alert. Severity follows
 * recoverability: a still-open deal with steps missed is a warning because it
 * can still be saved today; a lost one is information.
 *
 * Deliberately not batched into a digest. A manager acts on "Lorenzo left a
 * live deal without a follow-up time", not on "6 calls were analysed".
 */
export function callReviewRule(calls: CallReviewState[]): Candidate[] {
  return calls.map((c) => ({
    kind: "call_review",
    severity: c.priority >= 10 ? ("warning" as const) : ("info" as const),
    title: `${c.rep ?? "A rep"}: call needs a review`,
    body: c.reason,
    clientId: c.clientId,
    dedupeKey: `call-review:${c.recordingId}`,
  }));
}
