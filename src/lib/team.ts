import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  actionItems,
  activityLogs,
  activityReports,
  clients,
  reps,
  teamMembers,
} from "@/db/schema/app";
import { getRepGamification } from "@/lib/gamification/queries";
import { type RepGamification } from "@/lib/gamification/engine";
import { latestKitOverview, kitGrowthByConnection } from "@/lib/email/queries";
import { callTypeLabel, dispositionLabel } from "@/lib/sales/call-activity";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getEodCompliance,
  getPaidRepIds,
} from "@/lib/sales/queries";
import { type QuotaRow, listQuotasWithPacing } from "@/lib/sales/quota-queries";
import {
  type MemberEmailCard,
  type MemberEodSummary,
  type MemberReportRow,
  type MemberWorkItem,
  type WorkSummary,
  buildMemberEmailCard,
  summarizeEodActivity,
  summarizeWork,
} from "@/lib/team-profile";

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
  /** Action items assigned to this member (every member, rep-linked or not). */
  workItems: MemberWorkItem[];
  /** Status buckets for the work items, overdue counted against `nowMs`. */
  workSummary: WorkSummary;
  /** The member's EOD/BOD standing, when they map to a rep. */
  eod: MemberEodSummary | null;
  /** Their client's Kit email account, when the client has one connected. */
  email: MemberEmailCard | null;
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

/** Action items assigned to this member, newest first. */
async function memberWorkItems(memberId: string): Promise<MemberWorkItem[]> {
  const db = getDb();
  return db
    .select({
      id: actionItems.id,
      title: actionItems.title,
      status: actionItems.status,
      cadence: actionItems.cadence,
      dueDate: actionItems.dueDate,
      clientName: clients.name,
    })
    .from(actionItems)
    .leftJoin(clients, eq(actionItems.clientId, clients.id))
    .where(eq(actionItems.assigneeId, memberId))
    .orderBy(desc(actionItems.createdAt))
    .limit(50);
}

/** This rep's recent EOD/BOD submissions, newest first, for the timeline. */
async function memberEodReports(repId: string): Promise<MemberReportRow[]> {
  const db = getDb();
  return db
    .select({
      id: activityReports.id,
      kind: activityReports.kind,
      reportDate: activityReports.reportDate,
      metrics: activityReports.metrics,
      notes: activityReports.notes,
    })
    .from(activityReports)
    .where(eq(activityReports.repId, repId))
    .orderBy(desc(activityReports.reportDate))
    .limit(14);
}

/**
 * The member's client email account, when the client has a connected Kit
 * integration. Short-circuits to null for agency-wide members (no client), and
 * skips the growth query when the client has no Kit connection — so at most two
 * reads run, and only for a member whose lane actually has email.
 */
async function memberEmailData(
  clientName: string | null,
): Promise<MemberEmailCard | null> {
  if (!clientName) return null;
  const overview = await latestKitOverview();
  const row = overview.find((r) => r.clientName === clientName);
  if (!row) return null;
  const growth = await kitGrowthByConnection();
  return buildMemberEmailCard(row, growth.get(row.integrationId) ?? []);
}

export async function getMemberProfile(
  memberId: string,
  nowMs: number,
): Promise<MemberProfile | null> {
  const member = await getTeamMember(memberId);
  if (!member) return null;

  const repId = member.repId;

  // One bounded burst (≤ 8 concurrent reads — see the pool law in db/client.ts).
  // Work items and email run for every member; the rep-keyed reads resolve to
  // honest empties when the member isn't linked to a sales rep, so an unlinked
  // member still gets their work and their lane's email without paying for
  // quota, momentum, or commission queries.
  const [
    gamView,
    allQuotas,
    rollup,
    recentActivity,
    eodReports,
    eodCompliance,
    workItems,
    email,
  ] = await Promise.all([
    repId ? getRepGamification(repId) : Promise.resolve(null),
    repId ? listQuotasWithPacing(nowMs) : Promise.resolve([] as QuotaRow[]),
    repId ? getCommissionRollup() : Promise.resolve(null),
    repId ? repRecentActivity(repId) : Promise.resolve([] as MemberActivityRow[]),
    repId ? memberEodReports(repId) : Promise.resolve([] as MemberReportRow[]),
    repId ? getEodCompliance("eod") : Promise.resolve(null),
    memberWorkItems(memberId),
    memberEmailData(member.clientName),
  ]);

  const quotas = repId
    ? allQuotas.filter((q) => q.scope === "rep" && q.repId === repId)
    : [];

  const line = repId && rollup ? rollup.reps.find((r) => r.repId === repId) : undefined;
  let commission: MemberCommission | null = null;
  if (line && repId) {
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

  const eod = repId
    ? summarizeEodActivity(eodReports, eodCompliance?.asOf ?? null)
    : null;

  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const workSummary = summarizeWork(workItems, todayKey);

  return {
    member,
    rep: gamView ? gamView.rep : null,
    momentum: gamView ? gamView.gamification : null,
    quotas,
    commission,
    recentActivity,
    workItems,
    workSummary,
    eod,
    email,
  };
}
