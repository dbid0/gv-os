/**
 * Free-text -> quick-answer routing, key-free.
 *
 * Phase 1 has no LLM, but a typed question should still land on the right
 * deterministic answer when it obviously maps to one. This is a tiny keyword
 * matcher: it returns the READ tool a question most likely wants, but ONLY if
 * the viewer's role unlocks it — so a rep typing "who owes us money" gets no
 * admin answer, it simply falls through to the honest go-live state.
 *
 * Deliberately conservative: unknown or ambiguous text returns null and the
 * caller shows the stubbed-provider message rather than guessing. Pure — no
 * database, no clock, no network.
 */

import { type AiRole } from "@/lib/ai/roles";
import { canRunTool } from "@/lib/ai/tools";

interface Rule {
  toolId: string;
  /** Lowercased substrings; any hit selects the rule. */
  keywords: string[];
}

/**
 * Ordered most-specific first, so "quota" routes to the gap answer only after
 * "owe/owed/commission" has had its chance at the earnings answer.
 */
const RULES: readonly Rule[] = [
  // rep
  {
    toolId: "rep.earnings",
    keywords: ["what am i owed", "my commission", "i earn", "owed to me"],
  },
  {
    toolId: "rep.best_day",
    keywords: [
      "best day",
      "best weekday",
      "my record",
      "personal best",
      "perform best",
    ],
  },
  {
    // First-person only, so a manager's "our close rate" still routes to the
    // team answer instead of being hijacked by this rep-scoped one.
    toolId: "rep.conversion",
    keywords: [
      "my close rate",
      "my show rate",
      "my conversion",
      "am i converting",
      "how am i converting",
    ],
  },
  { toolId: "rep.streak", keywords: ["my streak", "streak", "how many days"] },
  {
    toolId: "rep.quota_gap",
    keywords: ["hit quota", "hit my quota", "left to hit", "to quota"],
  },
  {
    toolId: "rep.pacing",
    keywords: ["how am i pacing", "am i pacing", "my pace", "how am i doing"],
  },
  // manager
  {
    toolId: "team.missed_eod",
    keywords: ["missed eod", "miss eod", "who missed", "eod"],
  },
  {
    toolId: "team.behind_pace",
    keywords: ["behind pace", "who's behind", "whos behind", "behind"],
  },
  {
    toolId: "team.standings",
    keywords: [
      "top rep",
      "bottom rep",
      "best rep",
      "worst rep",
      "top and bottom",
      "standings",
      "who's my top",
    ],
  },
  { toolId: "team.close_rate", keywords: ["close rate", "closing rate", "close-rate"] },
  {
    toolId: "team.momentum",
    keywords: ["momentum", "on a streak", "who's on a streak", "streaks"],
  },
  // admin
  {
    toolId: "admin.net_month",
    keywords: [
      "net this month",
      "we net",
      "net cash",
      "collected this month",
      "cash this month",
    ],
  },
  {
    toolId: "admin.whats_failing",
    keywords: ["what's failing", "whats failing", "failing", "broken", "integration"],
  },
  {
    toolId: "admin.outstanding_ar",
    keywords: ["who owes", "owes us", "outstanding", "accounts receivable", "a/r"],
  },
  {
    toolId: "admin.payout_owed",
    keywords: ["owe the team", "payout", "owe reps", "what do we owe"],
  },
  {
    toolId: "admin.client_trend",
    keywords: [
      "clients up",
      "clients down",
      "up or down",
      "client trend",
      "which clients",
      "vs last month",
      "up vs last month",
    ],
  },
];

/**
 * The read tool a free-text question maps to for this role, or null when there
 * is no confident, role-permitted match.
 */
export function matchToolId(role: AiRole, text: string): string | null {
  const q = text.toLowerCase().trim();
  if (!q) return null;
  for (const rule of RULES) {
    if (!canRunTool(role, rule.toolId)) continue;
    if (rule.keywords.some((k) => q.includes(k))) return rule.toolId;
  }
  return null;
}
