import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityLogs, clients, reps, teamMembers } from "@/db/schema/app";
import { getRepGamification } from "@/lib/gamification/queries";
import { type RepGamification } from "@/lib/gamification/engine";
import { callTypeLabel, dispositionLabel } from "@/lib/sales/call-activity";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getPaidRepIds,
} from "@/lib/sales/queries";
import { type QuotaRow, listQuotasWithPacing } from "@/lib/sales/quota-queries";

/**
 * The Team read layer.
 *
 * Team is the backbone the rest of the app resolves to: a member links to their
 * sales `reps` row, and their profile then pulls quotas, momentum, and
 * commission owed from the read layers that already key off reps. Nothing here
 * rewrites that math — it imports the same query functions the Sales and
 * gamification surfaces use, so a member's numbers can never disagree with the
 * leaderboard's.
 */

/** A roster row, each member with their lane and rep link resolved. */
export interface TeamMemberRow {
  id: string;
  name: string;
  /** The granular job title (setter · copywriter · …). */
  role: string;
  /** Platform role: admin · sales_manager · sales_rep · team_member (or null on legacy rows). */
  roleKey: string | null;
  /** Sales-rep sub-type: setter · closer · dm_setter (or null). */
  repKind: string | null;
  email: string | null;
  status: string;
  clientId: string | null;
  clientName: string | null;
  /** The sales `reps` row this member is, when linked. */
  repId: string | null;
  notes: string | null;
}

const memberColumns = {
  id: teamMembers.id,
  name: teamMembers.name,
  role: teamMembers.role,
  roleKey: teamMembers.roleKey,
  repKind: teamMembers.repKind,
  email: teamMembers.email,
  status: teamMembers.status,
  clientId: teamMembers.clientId,
  clientName: clients.name,
  repId: teamMembers.repId,
  notes: teamMembers.notes,
} as const;

/** The full roster, each member with their lane resolved. */
export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const db = getDb();
  return db
    .select(memberColumns)
    .from(teamMembers)
    .leftJoin(clients, eq(teamMembers.clientId, clients.id))
    .orderBy(asc(teamMembers.name));
}

/** Active members only, for assignee pickers. */
export async function listActiveMembers(): Promise<
  { id: string; name: string; role: string }[]
> {
  const db = getDb();
  return db
    .select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.status, "active"))
    .orderBy(asc(teamMembers.name));
}

/** One member with their lane resolved, or null. */
export async function getTeamMember(id: string): Promise<TeamMemberRow | null> {
  const db = getDb();
  const [member] = await db
    .select(memberColumns)
    .from(teamMembers)
    .leftJoin(clients, eq(teamMembers.clientId, clients.id))
    .where(eq(teamMembers.id, id))
    .limit(1);
  return member ?? null;
}

/** A sales rep that can be linked to a member: active and not linked to anyone. */
export interface LinkableRep {
  id: string;
  name: string;
  role: string;
  teamName: string | null;
}

/**
 * Reps that are free to link to this member: active reps with no team member
 * already pointing at them, optionally scoped to the member's own lane. Scoping
 * to the lane keeps the picker short and stops a Grid member being linked to a
 * Vault rep by accident; an agency-wide member (no lane) sees every free rep.
 */
export async function listLinkableReps(
  clientId: string | null,
): Promise<LinkableRep[]> {
  const db = getDb();
  const where = clientId
    ? and(
        eq(reps.status, "active"),
        isNull(teamMembers.id),
        eq(reps.clientId, clientId),
      )
    : and(eq(reps.status, "active"), isNull(teamMembers.id));
  return db
    .select({
      id: reps.id,
      name: reps.name,
      role: reps.role,
      teamName: clients.name,
    })
    .from(reps)
    .leftJoin(teamMembers, eq(teamMembers.repId, reps.id))
    .leftJoin(clients, eq(reps.clientId, clients.id))
    .where(where)
    .orderBy(asc(reps.name));
}

/** One rep's commission position for the current payout run. */
export interface MemberCommission {
  period: string;
  owedCents: number;
  commissionCents: number;
  baseCents: number;
  bonusCents: number;
  skimCents: number;
  deals: number;
  paid: boolean;
}

/** A recent logged call / booking, label already resolved. */
export interface MemberActivityRow {
  id: string;
  title: string;
  sub: string | null;
  occurredAt: Date;
}

/**
 * A member's coherent profile: identity, and — when the member is linked to a
 * sales rep — their quotas, momentum, commission owed, and recent activity, all
 * pulled from the existing read layers. A member with no rep link gets the
 * identity card and null everywhere else, an honest empty state rather than a
 * wall of zeros.
 *
 * `nowMs` is passed in by the page from a single `new Date()`, so the read is a
 * pure function of the clock the caller chose (quota pacing needs it).
 */
export interface MemberProfile {
  member: TeamMemberRow;
  rep: { id: string; name: string; role: string; teamName: string | null } | null;
  momentum: RepGamification | null;
  quotas: QuotaRow[];
  commission: MemberCommission | null;
  recentActivity: MemberActivityRow[];
}

async function repRecentActivity(repId: string): Promise<MemberActivityRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: activityLogs.id,
      mode: activityLogs.mode,
      callType: activityLogs.callType,
      disposition: activityLogs.disposition,
      customerName: activityLogs.customerName,
      occurredAt: activityLogs.occurredAt,
    })
    .from(activityLogs)
    .where(eq(activityLogs.repId, repId))
    .orderBy(desc(activityLogs.occurredAt))
    .limit(8);

  return rows.map((r) => {
    const lead = r.mode === "booking" ? "Booking" : callTypeLabel(r.callType ?? "call");
    return {
      id: r.id,
      title: `${lead} · ${dispositionLabel(r.disposition)}`,
      sub: r.customerName,
      occurredAt: r.occurredAt,
    };
  });
}

export async function getMemberProfile(
  memberId: string,
  nowMs: number,
): Promise<MemberProfile | null> {
  const member = await getTeamMember(memberId);
  if (!member) return null;

  // No rep link → the identity card, and honest empties for the rest.
  if (!member.repId) {
    return {
      member,
      rep: null,
      momentum: null,
      quotas: [],
      commission: null,
      recentActivity: [],
    };
  }

  const repId = member.repId;
  const [gamView, allQuotas, rollup, recentActivity] = await Promise.all([
    getRepGamification(repId),
    listQuotasWithPacing(nowMs),
    getCommissionRollup(),
    repRecentActivity(repId),
  ]);

  const quotas = allQuotas.filter((q) => q.scope === "rep" && q.repId === repId);

  const line = rollup.reps.find((r) => r.repId === repId);
  let commission: MemberCommission | null = null;
  if (line) {
    const period = currentPayoutPeriod();
    const paid = await getPaidRepIds(period);
    commission = {
      period,
      owedCents: line.totalOwedCents,
      commissionCents: line.run.commissionCents,
      baseCents: line.run.baseCents,
      bonusCents: line.run.bonusCents,
      skimCents: line.skimCents,
      deals: line.run.dealCount,
      paid: paid.has(repId),
    };
  }

  return {
    member,
    rep: gamView ? gamView.rep : null,
    momentum: gamView ? gamView.gamification : null,
    quotas,
    commission,
    recentActivity,
  };
}
