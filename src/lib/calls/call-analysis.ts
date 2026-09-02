/**
 * The call READ — turning a transcript into "why did this call go the way it
 * did", so a manager gets the answer without listening to the recording.
 *
 * This module is PURE: it builds the prompt and parses the reply. The model
 * call and the database live in `call-analysis-run.ts`, which keeps the
 * judgement here testable with no key and no network.
 *
 * The parsing is deliberately forgiving about SHAPE and strict about MEANING.
 * A model may wrap JSON in prose or a code fence — that should still work. But
 * a reply that does not actually say what happened is rejected rather than
 * stored, because a confidently wrong read on a lost deal is worse for a rep
 * than no read at all.
 */

/** The disposition context handed to the model, so the read matches reality. */
export interface CallContext {
  /** The logged outcome, e.g. "sale_closed" or "not_interested". */
  disposition: string | null;
  customerName: string | null;
  /** The offer, so the model reads the call against the right pitch. */
  offerName: string | null;
}

/** The structured read we store. */
export interface CallAnalysis {
  /** One line: why it closed, or why it didn't. */
  outcome: string;
  /** The objections actually raised, in the prospect's own framing. */
  objections: string[];
  /** Steps of the close that were skipped or fumbled. */
  missedSteps: string[];
  /** What this rep should do differently next time. */
  coaching: string[];
  /** The next action on THIS lead, when the transcript implies one. */
  nextStep: string | null;
}

/** How much transcript we send. Long calls are trimmed from the middle. */
export const MAX_TRANSCRIPT_CHARS = 24_000;

/**
 * Trim a long transcript while keeping BOTH ends. The open sets up the frame
 * and the close carries the objection and the outcome — cutting the tail would
 * throw away the part that explains the result.
 */
export function trimTranscript(text: string, max = MAX_TRANSCRIPT_CHARS): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 40) / 2);
  return `${text.slice(0, half)}\n…[middle trimmed]…\n${text.slice(-half)}`;
}

export const CALL_ANALYSIS_SYSTEM = [
  "You review recorded sales calls for a high-ticket closing team.",
  "Read the transcript and report what actually happened — not what should have happened.",
  "Be concrete and quote the prospect's own words where it helps.",
  "Never invent an objection that was not raised.",
  "Reply with ONLY a JSON object, no prose, using exactly these keys:",
  '{"outcome": string, "objections": string[], "missedSteps": string[], "coaching": string[], "nextStep": string | null}',
  '"outcome" is ONE sentence naming why the call closed or did not close.',
].join(" ");

/** Build the user message for one call. */
export function buildAnalysisPrompt(transcript: string, context: CallContext): string {
  const facts = [
    context.offerName ? `Offer: ${context.offerName}` : null,
    context.customerName ? `Prospect: ${context.customerName}` : null,
    context.disposition ? `Logged outcome: ${context.disposition}` : null,
  ].filter(Boolean);

  return [
    facts.length ? `${facts.join("\n")}\n` : "",
    "Transcript:",
    trimTranscript(transcript),
  ].join("\n");
}

function stringsOf(v: unknown, cap = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .slice(0, cap);
}

/** Pull the JSON object out of a reply that may be fenced or wrapped in prose. */
function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], reply].filter(
    (c): c is string => typeof c === "string",
  );
  for (const raw of candidates) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Parse a model reply into a stored read, or null when it does not actually say
 * what happened. A missing/empty `outcome` is the rejection case: everything
 * else on the record is commentary, but the outcome is the answer the manager
 * opened this for.
 */
export function parseCallAnalysis(reply: string): CallAnalysis | null {
  if (!reply || reply.trim() === "") return null;
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  const outcome = typeof o.outcome === "string" ? o.outcome.trim() : "";
  if (outcome === "") return null;

  const nextStep =
    typeof o.nextStep === "string" && o.nextStep.trim() !== ""
      ? o.nextStep.trim()
      : null;

  return {
    outcome,
    objections: stringsOf(o.objections),
    missedSteps: stringsOf(o.missedSteps),
    coaching: stringsOf(o.coaching),
    nextStep,
  };
}

/** Dispositions worth escalating to a manager — a lost deal, not a won one. */
const ESCALATE = new Set(["not_interested", "no_show", "follow_up_booked", "dq"]);

/**
 * Should this read be pushed at the sales manager? A closed deal does not need
 * chasing; a lost or stalled one is where coaching changes the next outcome.
 */
export function shouldEscalate(
  disposition: string | null,
  analysis: CallAnalysis,
): boolean {
  if (!disposition) return false;
  if (!ESCALATE.has(disposition)) return false;
  return analysis.objections.length > 0 || analysis.coaching.length > 0;
}
