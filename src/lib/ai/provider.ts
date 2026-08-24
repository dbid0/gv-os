/**
 * The LLM provider adapter — STUBBED for Phase 1.
 *
 * The whole assistant is deliberately key-free until go-live: no API keys, no
 * network calls, no external SDK. But the seam the real provider will slot into
 * exists now, behind a clean interface, so wiring a live model later is a swap
 * of `getAiProvider()` and nothing else.
 *
 * The stub is honest: when a question doesn't map to a deterministic answer, it
 * returns the "full AI chat unlocks at go-live" state rather than pretending to
 * think. It never reaches the network, so it is fully testable and safe to ship.
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
  /** Whether the live provider is wired. Always false in Phase 1. */
  unlocked: boolean;
  /** The text to show the user. */
  text: string;
  /** Which provider answered — "stub" until go-live. */
  provider: string;
}

/** The honest degraded message shown when there's no deterministic answer. */
export const GO_LIVE_MESSAGE =
  "Full AI chat unlocks at go-live. For now, tap one of the starter questions — " +
  "those pull straight from your live numbers with no AI needed.";

export interface AiProvider {
  readonly id: string;
  readonly unlocked: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * The Phase-1 provider. Produces no completion and touches nothing external;
 * every call resolves to the go-live state.
 */
export class StubProvider implements AiProvider {
  readonly id = "stub";
  readonly unlocked = false;

  async complete(_request: AiCompletionRequest): Promise<AiCompletionResult> {
    void _request;
    return {
      ok: false,
      unlocked: false,
      text: GO_LIVE_MESSAGE,
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
