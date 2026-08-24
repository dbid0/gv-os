/**
 * The role-gated tool registry.
 *
 * Every capability the assistant could exercise is a Tool here, declaring the
 * ONE capability it requires. `toolsForRole(role)` returns only the tools that
 * role unlocks — this is the exact set of tools the agent for that viewer is
 * handed. A rep never even sees a money tool exists; it is not withheld at call
 * time, it is absent from the registry the agent is built with.
 *
 * Read tools back the deterministic quick-answers that already work today
 * (see `quick-answers.ts`). Write tools are declared so the registry is honest
 * about the full surface, but Phase 1 is key-free: writes execute at go-live
 * behind the LLM. The gating that matters — money/dev tools being unreachable
 * from a manager or rep — is a property of the registry itself, and is tested.
 *
 * Pure data + pure functions. No database, no clock, no `server-only`.
 */

import { type Capability } from "@/lib/ai/capabilities";
import { type AiRole, roleHasCapability } from "@/lib/ai/roles";

export type ToolKind = "read" | "write" | "dev";

export interface Tool {
  id: string;
  label: string;
  description: string;
  capability: Capability;
  kind: ToolKind;
  /**
   * False until the LLM go-live wires the writer. Read tools are live now via
   * the deterministic layer; write/dev tools are declared but not executable
   * in Phase 1. Never used to gate access — capability is the only gate.
   */
  liveNow: boolean;
}

/**
 * The full registry. Ordered widest-trust last so a scan reads like the ladder:
 * own reads, team reads, agency reads, then the write tools by trust.
 */
export const TOOL_REGISTRY: readonly Tool[] = [
  // ---- read.own (rep) ----
  {
    id: "rep.pacing",
    label: "My pacing",
    description: "How I'm pacing against my current quota.",
    capability: "read.own",
    kind: "read",
    liveNow: true,
  },
  {
    id: "rep.streak",
    label: "My streak",
    description: "My current and longest activity streak.",
    capability: "read.own",
    kind: "read",
    liveNow: true,
  },
  {
    id: "rep.earnings",
    label: "What I'm owed",
    description: "Commission owed to me from closed deals.",
    capability: "read.own",
    kind: "read",
    liveNow: true,
  },
  {
    id: "rep.quota_gap",
    label: "What hits quota",
    description: "What's left to hit my quota this period.",
    capability: "read.own",
    kind: "read",
    liveNow: true,
  },
  // ---- read.team (manager) ----
  {
    id: "team.behind_pace",
    label: "Who's behind pace",
    description: "Reps and teams tracking behind their quota.",
    capability: "read.team",
    kind: "read",
    liveNow: true,
  },
  {
    id: "team.missed_eod",
    label: "Who missed EOD",
    description: "Reps who didn't file an EOD on the latest day.",
    capability: "read.team",
    kind: "read",
    liveNow: true,
  },
  {
    id: "team.close_rate",
    label: "Close-rate trend",
    description: "The team's close rate — deals over shows.",
    capability: "read.team",
    kind: "read",
    liveNow: true,
  },
  {
    id: "team.momentum",
    label: "Team momentum",
    description: "Streaks and personal bests across the team.",
    capability: "read.team",
    kind: "read",
    liveNow: true,
  },
  // ---- read.all (admin) ----
  {
    id: "admin.net_month",
    label: "Net this month",
    description: "All-in cash collected this month across the agency.",
    capability: "read.all",
    kind: "read",
    liveNow: true,
  },
  {
    id: "admin.whats_failing",
    label: "What's failing",
    description: "Integrations whose last sync failed.",
    capability: "read.all",
    kind: "read",
    liveNow: true,
  },
  {
    id: "admin.outstanding_ar",
    label: "Who owes what",
    description: "Deals with money still outstanding, largest first.",
    capability: "read.all",
    kind: "read",
    liveNow: true,
  },
  {
    id: "admin.payout_owed",
    label: "Payout owed",
    description: "What each rep is owed in the current payout run.",
    capability: "read.all",
    kind: "read",
    liveNow: true,
  },
  // ---- write.activity (rep) ----
  {
    id: "activity.log_call",
    label: "Log a call",
    description: "Record a call and its disposition.",
    capability: "write.activity",
    kind: "write",
    liveNow: false,
  },
  {
    id: "activity.submit_eod",
    label: "Submit EOD",
    description: "File an end-of-day activity report.",
    capability: "write.activity",
    kind: "write",
    liveNow: false,
  },
  // ---- write.coaching (manager) ----
  {
    id: "coaching.create_quota",
    label: "Create a quota",
    description: "Set a target for a rep or team.",
    capability: "write.coaching",
    kind: "write",
    liveNow: false,
  },
  {
    id: "coaching.assign_task",
    label: "Assign a task",
    description: "Assign an action item to a rep.",
    capability: "write.coaching",
    kind: "write",
    liveNow: false,
  },
  {
    id: "coaching.flag_rep",
    label: "Flag a rep",
    description: "Flag a rep for coaching attention.",
    capability: "write.coaching",
    kind: "write",
    liveNow: false,
  },
  // ---- write.money (ADMIN ONLY) ----
  {
    id: "money.record_payout",
    label: "Record a payout",
    description: "Mark a rep's payout paid in the ledger.",
    capability: "write.money",
    kind: "write",
    liveNow: false,
  },
  {
    id: "money.log_deal",
    label: "Log a deal",
    description: "Record a closed deal and its cash.",
    capability: "write.money",
    kind: "write",
    liveNow: false,
  },
  {
    id: "money.reconcile",
    label: "Reconcile",
    description: "Run finance-sheet reconciliation.",
    capability: "write.money",
    kind: "write",
    liveNow: false,
  },
  // ---- dev.inspect (ADMIN ONLY) ----
  {
    id: "dev.inspect_row",
    label: "Inspect a row",
    description: "Read a raw database row for debugging.",
    capability: "dev.inspect",
    kind: "dev",
    liveNow: false,
  },
];

export function toolById(id: string): Tool | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

/** The exact tools the agent for `role` is handed — gated by capability. */
export function toolsForRole(role: AiRole): Tool[] {
  return TOOL_REGISTRY.filter((t) => roleHasCapability(role, t.capability));
}

/** Whether a role may run a specific tool. Unknown tool ids are never runnable. */
export function canRunTool(role: AiRole, toolId: string): boolean {
  const tool = toolById(toolId);
  return tool ? roleHasCapability(role, tool.capability) : false;
}
