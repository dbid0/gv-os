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
