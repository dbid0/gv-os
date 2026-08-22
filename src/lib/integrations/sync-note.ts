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
