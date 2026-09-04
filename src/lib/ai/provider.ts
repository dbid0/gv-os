/**
 * The LLM provider adapter — no hosted model, by design.
 *
 * GV OS runs on Vercel; the model that reads calls runs LOCALLY through Claude
 * Code (see scripts/analyze-calls). That works for batch work — claim the
 * pending rows, think, write the answers back — but it cannot serve an
 * interactive chat request, which has to answer inside the request itself.
 *
 * So the starter questions do the useful half without a model at all: they
 * resolve to deterministic answers computed from live data. Anything
 * open-ended returns the honest message below rather than pretending to think.
 * It never reaches the network, so it is fully testable and safe to ship.
 *
 * The seam is real: wiring a hosted model later is a swap of `getAiProvider()`
 * and nothing else.
 *
 * Pure — no `server-only`, no imports with side effects. Coverable to 100%.
 */

export type AiMessageRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiCompletionRequest {
  /** The face asking — Operator / Coach / Wingman — for the system framing. */
  face: string;
  system: string;
  messages: AiMessage[];
}

export interface AiCompletionResult {
  /** Whether a real completion was produced. Always false while stubbed. */
  ok: boolean;
  /** Whether a hosted model is wired. False while answers stay deterministic. */
  unlocked: boolean;
  /** The text to show the user. */
  text: string;
  /** Which provider answered — "stub" while there is no hosted model. */
  provider: string;
}

/**
 * The honest message when a question has no deterministic answer.
 *
 * It names the actual reason rather than a date: there is no hosted model
 * behind this box. Saying "unlocks at go-live" implied someone was waiting on
 * a launch, when the real answer is that the model runs locally and does batch
 * work — the call reads — not live chat.
 */
export const NO_MODEL_MESSAGE =
  "Open-ended chat isn't wired up here — the model that reads your calls runs " +
  "locally, not inside this app. Tap a starter question instead: those are " +
  "computed straight from your live numbers, no model needed.";

export interface AiProvider {
  readonly id: string;
  readonly unlocked: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * The Phase-1 provider. Produces no completion and touches nothing external;
 * every call resolves to the no-model state.
 */
export class StubProvider implements AiProvider {
  readonly id = "stub";
  readonly unlocked = false;

  async complete(_request: AiCompletionRequest): Promise<AiCompletionResult> {
    void _request;
    return {
      ok: false,
      unlocked: false,
      text: NO_MODEL_MESSAGE,
      provider: this.id,
    };
  }
}

/**
 * The provider the app uses. Phase 1 always returns the stub — no env lookup,
 * no key, no network. Go-live replaces the body here (and only here).
 */
export function getAiProvider(): AiProvider {
  return new StubProvider();
}
