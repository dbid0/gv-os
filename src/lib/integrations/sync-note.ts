/**
 * Sync-health notes for connection cards. A failed pull must never look like
 * a healthy one: failures write a recognizable note (without touching
 * lastSyncAt, which always means "last SUCCESSFUL sync") and the card
 * renders them as a warning.
 */

const FAILURE_PREFIX = "sync failed: ";
const MAX_NOTE_LENGTH = 140;

export function failureNote(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const flat = message.replace(/\s+/g, " ").trim() || "unknown error";
  const note = `${FAILURE_PREFIX}${flat}`;
  return note.length > MAX_NOTE_LENGTH
    ? `${note.slice(0, MAX_NOTE_LENGTH - 1)}…`
    : note;
}

export function isFailureNote(note: string | null | undefined): boolean {
  return typeof note === "string" && note.startsWith(FAILURE_PREFIX);
}

/**
 * A connection is STALE when its last successful sync is older than this.
 * The scheduler runs every 15 minutes, so two hours means at least eight
 * consecutive runs did nothing for this connection — the scheduler is stuck,
 * the key is dead, or the provider is refusing us. An old date with no alarm
 * reads as "fine"; this makes silence itself a signal.
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function isStaleSync(
  lastSyncAt: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!lastSyncAt) return false; // never-synced is "pending", not "stale"
  const t = typeof lastSyncAt === "string" ? new Date(lastSyncAt) : lastSyncAt;
  if (Number.isNaN(t.getTime())) return false;
  return now.getTime() - t.getTime() > STALE_AFTER_MS;
}
