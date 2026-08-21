/**
 * The team roles, in display order. Pure data — safe to import from client
 * components and tests. The roster table and every assignee picker render from
 * this list, so adding a role here is the whole change.
 */
export const TEAM_ROLES = [
  { value: "operator", label: "Operator" },
  { value: "manager", label: "Manager" },
  { value: "creative_director", label: "Creative director" },
  { value: "copywriter", label: "Copywriter" },
  { value: "va", label: "VA" },
  { value: "setter", label: "Setter" },
  { value: "closer", label: "Closer" },
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number]["value"];

export const TEAM_ROLE_VALUES = TEAM_ROLES.map((r) => r.value) as [
  TeamRole,
  ...TeamRole[],
];

/** Human label for a stored role; falls back to the raw value for old data. */
export function roleLabel(role: string): string {
  return TEAM_ROLES.find((r) => r.value === role)?.label ?? role;
}

/** Sort key: roster order follows TEAM_ROLES, unknown roles sink to the end. */
export function roleRank(role: string): number {
  const i = TEAM_ROLES.findIndex((r) => r.value === role);
  return i === -1 ? TEAM_ROLES.length : i;
}

/**
 * What to show as an item's assignee: the roster member's name wins; rows from
 * before the Team module fall back to their free-text name; otherwise null.
 */
export function assigneeDisplay(
  memberName: string | null,
  legacyText: string | null,
): string | null {
  return memberName ?? (legacyText?.trim() ? legacyText : null);
}
