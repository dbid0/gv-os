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
  { value: "dm_setter", label: "DM setter" },
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

// ---------------------------------------------------------------- Platform roles
//
// The team is the backbone the rest of the app resolves to, so a member carries
// TWO facts: a platform role (what they can see and which surfaces resolve to
// them) and, for two of those roles, a sub-type that refines the job. This is
// pure data + pure composition — the add form, the roster, the profile, the
// server action, and the tests all speak this one vocabulary, so the columns a
// member lands in can never disagree across surfaces.

/**
 * The four platform roles (v2 §6). Stored in `team_members.role_key`. Admin and
 * Sales Manager stand alone; Sales Rep and Team Member each take a sub-type.
 */
export const PLATFORM_ROLES = [
  { value: "admin", label: "Admin", blurb: "Full access, the numbers included." },
  {
    value: "sales_manager",
    label: "Sales Manager",
    blurb: "Runs a team's floor and its quotas.",
  },
  { value: "sales_rep", label: "Sales Rep", blurb: "Sets or closes on a team." },
  {
    value: "team_member",
    label: "Team Member",
    blurb: "Runs assigned work, no accounting.",
  },
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number]["value"];

export const PLATFORM_ROLE_VALUES = PLATFORM_ROLES.map((r) => r.value) as [
  PlatformRole,
  ...PlatformRole[],
];

export function platformRoleLabel(key: string): string {
  return PLATFORM_ROLES.find((r) => r.value === key)?.label ?? key;
}

export function isPlatformRole(value: string): value is PlatformRole {
  return PLATFORM_ROLE_VALUES.includes(value as PlatformRole);
}

/** Sales-rep sub-types. Stored in `team_members.rep_kind` and mirrored in `role`. */
export const REP_KINDS = [
  { value: "setter", label: "Setter" },
  { value: "closer", label: "Closer" },
  { value: "dm_setter", label: "DM setter" },
] as const;

export type RepKind = (typeof REP_KINDS)[number]["value"];

export const REP_KIND_VALUES = REP_KINDS.map((r) => r.value) as [RepKind, ...RepKind[]];

export function repKindLabel(key: string): string {
  return REP_KINDS.find((r) => r.value === key)?.label ?? key;
}

/** Team-member sub-types — the job title. Stored in `team_members.role`. */
export const MEMBER_SUBTYPES = [
  { value: "copywriter", label: "Copywriter" },
  { value: "va", label: "VA" },
  { value: "creative_director", label: "Creative director" },
] as const;

export type MemberSubtype = (typeof MEMBER_SUBTYPES)[number]["value"];

export const MEMBER_SUBTYPE_VALUES = MEMBER_SUBTYPES.map((r) => r.value) as [
  MemberSubtype,
  ...MemberSubtype[],
];

/** The stored shape of a member's role, as it lives across three columns. */
export interface MemberRoleShape {
  /** The granular job title. */
  role: string;
  /** The platform role, or null for a legacy row from before role_key existed. */
  roleKey: string | null;
  /** The sales-rep sub-type, or null. */
  repKind: string | null;
}

/**
 * A member's platform role. New members store it directly; a legacy row
 * (`role_key` null) is inferred from its job title so the roster never shows a
 * member as role-less.
 */
export function platformRoleOf(m: MemberRoleShape): PlatformRole {
  if (m.roleKey && isPlatformRole(m.roleKey)) return m.roleKey;
  if (m.role === "manager") return "sales_manager";
  if (m.role === "setter" || m.role === "closer" || m.role === "dm_setter") {
    return "sales_rep";
  }
  if (m.role === "operator") return "admin";
  return "team_member";
}

/** The sub-type label under the platform role, or null when there is none. */
export function memberSubtypeLabel(m: MemberRoleShape): string | null {
  const platform = platformRoleOf(m);
  if (platform === "sales_rep") return repKindLabel(m.repKind ?? m.role);
  if (platform === "team_member") return roleLabel(m.role);
  return null;
}

/**
 * The full role display: "Sales Rep · Closer", "Team Member · Copywriter", or
 * just "Admin" / "Sales Manager" where there is no sub-type.
 */
export function memberRoleLabel(m: MemberRoleShape): string {
  const base = platformRoleLabel(platformRoleOf(m));
  const sub = memberSubtypeLabel(m);
  return sub ? `${base} · ${sub}` : base;
}

/** True when a member's role is one that sells — the profile can carry a rep. */
export function isSalesRole(m: MemberRoleShape): boolean {
  const platform = platformRoleOf(m);
  return platform === "sales_rep" || platform === "sales_manager";
}

/** What the add/edit form collects: a platform role plus an optional sub-type. */
export interface MemberRoleForm {
  platformRole: PlatformRole;
  /** Chosen when platformRole = sales_rep. Defaults to closer. */
  repKind?: RepKind | null;
  /** Chosen when platformRole = team_member. Defaults to copywriter. */
  subtype?: MemberSubtype | null;
}

/** The three columns a member row stores, resolved from a form choice. */
export interface MemberRoleColumns {
  role: string;
  roleKey: PlatformRole;
  repKind: RepKind | null;
}

/**
 * Resolve the stored columns from a form choice. The single place that decides
 * what lands in `role`, `role_key`, and `rep_kind`, so every surface agrees.
 */
export function memberRoleColumns(form: MemberRoleForm): MemberRoleColumns {
  switch (form.platformRole) {
    case "sales_rep": {
      const kind = form.repKind ?? "closer";
      return { role: kind, roleKey: "sales_rep", repKind: kind };
    }
    case "sales_manager":
      return { role: "manager", roleKey: "sales_manager", repKind: null };
    case "team_member": {
      const sub = form.subtype ?? "copywriter";
      return { role: sub, roleKey: "team_member", repKind: null };
    }
    case "admin":
      return { role: "operator", roleKey: "admin", repKind: null };
  }
}
