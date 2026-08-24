/**
 * AI assistant capabilities — the permission atoms the tool registry is gated
 * on. Pure data, no imports: safe from client, server, and tests alike.
 *
 * A capability is the single unit of "what the assistant is allowed to do for
 * this viewer". Every tool declares exactly ONE required capability, and a
 * viewer's agent only ever receives the tools whose capability their role
 * unlocks (see `roles.ts` for the role -> capability map, `tools.ts` for the
 * registry). The ordering here is the trust ladder, widest reach last.
 *
 * The two capabilities that move money or expose internals — `write.money` and
 * `dev.inspect` — are ADMIN-ONLY by construction. Nothing a manager or rep can
 * see or do is ever gated on them, and a unit test proves their registries
 * never contain a tool that requires them.
 */

export const CAPABILITIES = [
  /** Read only your own numbers (a rep's own pacing, streak, earnings). */
  "read.own",
  /** Read the team's numbers (a manager, scoped to their own offers). */
  "read.team",
  /** Read everything across the agency (admin). */
  "read.all",
  /** Log activity: a call logged, an EOD submitted. */
  "write.activity",
  /** Coaching writes: set a quota, assign a task, flag a rep. */
  "write.coaching",
  /** Money writes: payouts, deals, reconciliation. ADMIN ONLY. */
  "write.money",
  /** Inspect raw rows / internals. ADMIN ONLY. */
  "dev.inspect",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** The capabilities no non-admin role may ever hold. Asserted in tests. */
export const ADMIN_ONLY_CAPABILITIES: readonly Capability[] = [
  "write.money",
  "dev.inspect",
];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/** True when a capability is one only an admin may ever hold. */
export function isAdminOnlyCapability(cap: Capability): boolean {
  return ADMIN_ONLY_CAPABILITIES.includes(cap);
}
