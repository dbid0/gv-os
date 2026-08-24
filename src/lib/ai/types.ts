/**
 * Serializable AI contract shapes shared across the server/client boundary.
 *
 * Kept in a PURE module (no `server-only`) so a client component can import the
 * types without dragging the server read layers into its bundle. The values
 * that fill these cross a Server Action, so everything here must be plain JSON.
 */

import { type Capability } from "@/lib/ai/capabilities";

/** A user's request: a tapped starter tool, a typed question, or both. */
export interface AiRequest {
  toolId?: string;
  text?: string;
}

/** One assistant answer, ready to render and to persist. */
export interface AiAnswer {
  headline: string;
  details: string[];
  /** The tool that answered, or null when the stubbed provider replied. */
  toolId: string | null;
  capability: Capability | null;
  /** True only when a live LLM produced the text — never in Phase 1. */
  unlockedByLlm: boolean;
}
