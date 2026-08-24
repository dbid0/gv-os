/**
 * Starter questions — the deterministic quick-answers that work NOW, no LLM.
 *
 * Each starter question is a one-tap prompt bound to a READ tool in the
 * registry. Because it names a tool, it inherits that tool's capability gate:
 * `starterQuestionsForRole` only ever returns questions whose tool the role
 * unlocks, so a rep is never offered "who owes what" and a manager is never
 * offered a money question. The answer service resolves the tool id to a real
 * computation over existing read layers.
 *
 * Pure data + pure functions. No database, no clock.
 */

import { type AiRole } from "@/lib/ai/roles";
import { type Tool, canRunTool, toolById } from "@/lib/ai/tools";

export interface StarterQuestion {
  /** The read tool this question runs. */
  toolId: string;
  /** The tappable prompt text, first-person to match the face. */
  prompt: string;
}

/**
 * The catalogue, grouped by the face they belong to. Every `toolId` MUST be a
 * read tool that exists in the registry (asserted in tests), so a typo can
 * never ship a dead chip.
 */
export const STARTER_QUESTIONS: readonly StarterQuestion[] = [
  // Wingman (rep)
  { toolId: "rep.pacing", prompt: "How am I pacing?" },
  { toolId: "rep.streak", prompt: "What's my streak?" },
  { toolId: "rep.earnings", prompt: "What am I owed?" },
  { toolId: "rep.quota_gap", prompt: "What do I need to hit quota?" },
  // Coach (manager)
  { toolId: "team.behind_pace", prompt: "Who's behind pace?" },
  { toolId: "team.missed_eod", prompt: "Who missed EOD?" },
  { toolId: "team.close_rate", prompt: "What's our close rate?" },
  { toolId: "team.momentum", prompt: "Who's on a streak?" },
  // Operator (admin)
  { toolId: "admin.net_month", prompt: "What did we net this month?" },
  { toolId: "admin.whats_failing", prompt: "What's failing right now?" },
  { toolId: "admin.outstanding_ar", prompt: "Who owes us money?" },
  { toolId: "admin.payout_owed", prompt: "What do we owe the team?" },
];

/** A starter question with its resolved tool, ready to render. */
export interface ResolvedStarter extends StarterQuestion {
  tool: Tool;
}

/**
 * The starter chips a given face is allowed to show — capability-gated.
 *
 * Every starter's `toolId` is a real read tool (asserted in tests), so the
 * non-null assertion after `canRunTool` is safe: an id the role cannot run is
 * filtered out first, and `canRunTool` already returns false for any unknown id.
 */
export function starterQuestionsForRole(role: AiRole): ResolvedStarter[] {
  return STARTER_QUESTIONS.filter((q) => canRunTool(role, q.toolId)).map((q) => ({
    ...q,
    tool: toolById(q.toolId)!,
  }));
}
