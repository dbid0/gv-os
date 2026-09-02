/**
 * Fathom call intelligence — the PURE half.
 *
 * Fathom records the closer calls. The moment a rep logs a call, we want its
 * recording and transcript attached, so a manager can see WHY a call did not
 * close without chasing anyone for a link. Two jobs live here, both pure so
 * they can be tested without Fathom or a database:
 *
 *   1. normalising Fathom's payload into the shape we store, and
 *   2. deciding WHICH logged call a recording belongs to.
 *
 * (2) is the part that has to be careful. Attaching a transcript to the wrong
 * call would put one prospect's conversation on another's record, so matching
 * is deliberately conservative: it needs a real signal (the same customer, or a
 * tight time overlap), and when two calls are equally plausible it returns
 * NOTHING rather than guessing.
 */

/** A recording as we store it, normalised from Fathom's payload. */
export interface FathomRecording {
  externalId: string;
  title: string | null;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  durationSeconds: number | null;
  occurredAt: Date | null;
  /** Display names / emails captured on the call. */
  participants: string[];
}

/** The fields of a logged call that matching looks at. */
export interface CallCandidate {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  occurredAt: Date;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.round(Number(v));
  }
  return null;
}

function date(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pull the transcript out of whichever shape Fathom returned. */
function transcriptOf(raw: Record<string, unknown>): string | null {
  const direct = str(raw.transcript) ?? str(raw.transcript_text);
  if (direct) return direct;
  // A segment list: [{ speaker, text }, …] → "Speaker: text" lines.
  const segments = raw.transcript ?? raw.segments;
  if (Array.isArray(segments)) {
    const lines = segments
      .map((s) => {
        if (typeof s === "string") return s.trim();
        if (!s || typeof s !== "object") return "";
        const seg = s as Record<string, unknown>;
        const who = str(seg.speaker) ?? str(seg.speaker_name);
        const text = str(seg.text) ?? str(seg.sentence);
        if (!text) return "";
        return who ? `${who}: ${text}` : text;
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }
  return null;
}

function participantsOf(raw: Record<string, unknown>): string[] {
  const list = raw.participants ?? raw.attendees ?? raw.invitees;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const p of list) {
    if (typeof p === "string" && p.trim()) {
      out.push(p.trim());
      continue;
    }
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      const v = str(o.name) ?? str(o.email) ?? str(o.display_name);
      if (v) out.push(v);
    }
  }
  return [...new Set(out)];
}

/**
 * Normalise one Fathom recording. Returns null when there is no usable id —
 * without a stable external id we could not de-duplicate, and re-importing
 * would pile up copies of the same call.
 */
export function normalizeFathomRecording(raw: unknown): FathomRecording | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const externalId = str(r.id) ?? str(r.recording_id) ?? str(r.meeting_id);
  if (!externalId) return null;

  return {
    externalId,
    title: str(r.title) ?? str(r.meeting_title) ?? str(r.name),
    recordingUrl: str(r.url) ?? str(r.recording_url) ?? str(r.share_url),
    transcript: transcriptOf(r),
    summary: str(r.summary) ?? str(r.ai_summary) ?? str(r.notes),
    durationSeconds: num(r.duration_seconds) ?? num(r.duration),
    occurredAt:
      date(r.started_at) ?? date(r.created_at) ?? date(r.recorded_at) ?? date(r.date),
    participants: participantsOf(r),
  };
}

/** Loose comparison: case/whitespace-insensitive. */
const norm = (s: string) => s.trim().toLowerCase();

/** How far apart a recording and a logged call may be and still be the same call. */
export const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Which logged call this recording belongs to, or null when it cannot be told
 * confidently.
 *
 * A recording matches on identity (the customer's email or name appears among
 * the participants or in the title) or, failing that, on a tight time overlap.
 * An AMBIGUOUS result — two candidates equally close in time with no identity
 * signal — returns null on purpose: a wrong attachment puts one prospect's
 * transcript on another prospect's record, which is worse than none.
 */
export function matchRecordingToCall(
  recording: FathomRecording,
  candidates: CallCandidate[],
): CallCandidate | null {
  if (candidates.length === 0 || !recording.occurredAt) return null;
  const when = recording.occurredAt.getTime();
  const haystack = [
    ...recording.participants.map(norm),
    norm(recording.title ?? ""),
  ].join(" | ");

  const inWindow = candidates.filter(
    (c) => Math.abs(c.occurredAt.getTime() - when) <= MATCH_WINDOW_MS,
  );
  if (inWindow.length === 0) return null;

  // 1) Identity beats timing — an email is the strongest signal, then a name.
  const byEmail = inWindow.filter(
    (c) => c.customerEmail && haystack.includes(norm(c.customerEmail)),
  );
  if (byEmail.length === 1) return byEmail[0];
  if (byEmail.length > 1) return null;

  const byName = inWindow.filter(
    (c) =>
      c.customerName &&
      norm(c.customerName).length > 2 &&
      haystack.includes(norm(c.customerName)),
  );
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;

  // 2) No identity signal: only accept a lone candidate in the window.
  return inWindow.length === 1 ? inWindow[0] : null;
}
