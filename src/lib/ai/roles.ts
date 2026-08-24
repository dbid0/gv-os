/**
 * The AI assistant's role model — ONE engine, three faces.
 *
 * The assistant reuses the app's existing role model (`@/lib/auth/roles`) rather
 * than inventing its own. Of those roles, three get an assistant face:
 *
 *   admin         -> "Operator"  — the whole business
 *   sales_manager -> "Coach"     — the team, scoped to their offers
 *   sales_rep     -> "Wingman"   — their own day
 *
 * Each face is the SAME engine with a different capability set, so scope is a
 * property of the role, not a fork in the code. The capability map is a strict
 * ladder — a rep's capabilities are a subset of a manager's, which are a subset
 * of an admin's — plus two admin-exclusive rungs (`write.money`, `dev.inspect`)
 * that no other role can ever reach. That containment is enforced by tests.
 *
 * Pure data + pure functions: no database, no `server-only`, no clock. This is
 * the piece the whole gating story is tested against.
 */

import {
  type Capability,
  ADMIN_ONLY_CAPABILITIES,
  isAdminOnlyCapability,
} from "@/lib/ai/capabilities";

/** The subset of app roles that get an assistant face. */
export const AI_ROLES = ["admin", "sales_manager", "sales_rep"] as const;
export type AiRole = (typeof AI_ROLES)[number];

export interface AiFace {
  role: AiRole;
  /** The name the panel wears: Operator / Coach / Wingman. */
  name: string;
  /** One line under the name — what this face is for. */
  tagline: string;
}

export const AI_FACES: Record<AiRole, AiFace> = {
  admin: {
    role: "admin",
    name: "Operator",
    tagline: "Your command center — net cash, what's failing, who owes what.",
  },
  sales_manager: {
    role: "sales_manager",
    name: "Coach",
    tagline: "Your team at a glance — who's behind, who missed EOD, close-rate trend.",
  },
  sales_rep: {
    role: "sales_rep",
    name: "Wingman",
    tagline: "Your day — pacing, streak, what you're owed, what hits quota.",
  },
};

/**
 * Role -> capabilities. Deliberately written as a ladder so the containment is
 * obvious at a glance: rep ⊂ manager ⊂ admin, and only admin carries the two
 * money/dev rungs. If you widen a lower role, the isolation test is the alarm.
 */
const ROLE_CAPABILITIES: Record<AiRole, readonly Capability[]> = {
  sales_rep: ["read.own", "write.activity"],
  sales_manager: ["read.own", "read.team", "write.activity", "write.coaching"],
  admin: [
    "read.own",
    "read.team",
    "read.all",
    "write.activity",
    "write.coaching",
    "write.money",
    "dev.inspect",
  ],
};

export function isAiRole(role: string | null | undefined): role is AiRole {
  return typeof role === "string" && (AI_ROLES as readonly string[]).includes(role);
}

/** A fresh copy of a role's capabilities, so callers can't mutate the map. */
export function capabilitiesForRole(role: AiRole): Capability[] {
  return [...ROLE_CAPABILITIES[role]];
}

export function roleHasCapability(role: AiRole, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

export function aiFace(role: AiRole): AiFace {
  return AI_FACES[role];
}

/**
 * The guarantee, expressed as code the test can call: no non-admin role holds
 * an admin-only capability. Returns the offending pairs (empty when healthy).
 *
 * `caps` is injectable so a test can feed a deliberately-leaky map and prove the
 * detector actually fires; called with no argument it audits the real map.
 */
export function adminOnlyLeaks(
  caps: Partial<Record<AiRole, readonly Capability[]>> = ROLE_CAPABILITIES,
): { role: AiRole; capability: Capability }[] {
  const leaks: { role: AiRole; capability: Capability }[] = [];
  for (const role of AI_ROLES) {
    if (role === "admin") continue;
    for (const cap of caps[role] ?? []) {
      if (isAdminOnlyCapability(cap)) leaks.push({ role, capability: cap });
    }
  }
  return leaks;
}

export { ADMIN_ONLY_CAPABILITIES };
