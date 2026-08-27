import type { KitOverviewRow } from "@/lib/email/queries";

/**
 * Pure shaping for the richer team-member profile.
 *
 * The profile's read layer (`src/lib/team.ts`) fetches the rows; everything that
 * turns those rows into what a card renders — bucketing work by status, folding
 * a member's EOD/BOD reports into a compliance read, picking their client's Kit
 * connection and its growth series — lives here as pure functions so it can be
 * unit-tested without a database. No money is computed here: commission and
 * quota figures stay in the sales read layer and arrive already derived.
 */

// ---------------------------------------------------------------- Work items

/** A work item assigned to a member, shaped for the profile's work section. */
export interface MemberWorkItem {
  id: string;
  title: string;
  status: string;
  cadence: string;
  dueDate: string | null;
  clientName: string | null;
}

export interface WorkSummary {
  total: number;
  toDo: number;
  inProgress: number;
  done: number;
  /** Open (not completed) items past their due date, as of `todayKey`. */
  overdue: number;
}

/** Bucket a member's work items by status, counting overdue open items. */
export function summarizeWork(items: MemberWorkItem[], todayKey: string): WorkSummary {
  let toDo = 0;
  let inProgress = 0;
  let done = 0;
  let overdue = 0;
  for (const it of items) {
    if (it.status === "completed") done++;
    else if (it.status === "in_progress") inProgress++;
    else toDo++;
    if (it.status !== "completed" && it.dueDate && it.dueDate < todayKey) overdue++;
  }
  return { total: items.length, toDo, inProgress, done, overdue };
}

// ---------------------------------------------------------------- EOD / BOD

/** A submitted EOD/BOD report shaped for the profile timeline. */
export interface MemberReportRow {
  id: string;
  kind: string;
  reportDate: Date;
  metrics: Record<string, number>;
  notes: string | null;
}

export interface MemberEodSummary {
  reports: MemberReportRow[];
  lastEodAt: Date | null;
  lastBodAt: Date | null;
  /** Counts within the fetched window (recent reports), not all-time. */
  eodCount: number;
  bodCount: number;
  /** True when the member filed an EOD on the team's latest EOD day. */
  filedLatestDay: boolean;
  /** The team's latest EOD day, the reference the compliance read is against. */
  latestEodDay: Date | null;
}

function utcDayKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Fold a member's recent reports into their EOD standing: when they last filed
 * each cadence, and whether they filed on the team's most recent EOD day.
 */
export function summarizeEodActivity(
  reports: MemberReportRow[],
  latestEodDay: Date | null,
): MemberEodSummary {
  const maxDate = (kind: string) =>
    reports
      .filter((r) => r.kind === kind)
      .reduce<Date | null>(
        (max, r) => (!max || r.reportDate > max ? r.reportDate : max),
        null,
      );
  const lastEodAt = maxDate("eod");
  const lastBodAt = maxDate("bod");
  const filedLatestDay =
    !!latestEodDay && !!lastEodAt && utcDayKey(lastEodAt) === utcDayKey(latestEodDay);
  return {
    reports,
    lastEodAt,
    lastBodAt,
    eodCount: reports.filter((r) => r.kind === "eod").length,
    bodCount: reports.filter((r) => r.kind === "bod").length,
    filedLatestDay,
    latestEodDay,
  };
}

// ---------------------------------------------------------------- Email

/** The member's client email account, shaped for the profile's email card. */
export interface MemberEmailCard {
  integrationId: string;
  clientName: string | null;
  accountName: string | null;
  plan: string | null;
  subscriberCount: number | null;
  sequenceCount: number;
  activeSequences: number;
  tagCount: number;
  takenAt: Date;
  /** Subscriber-count series (oldest → newest) for a small sparkline. */
  series: { at: Date; value: number }[];
  /** Net subscribers added across the captured window; null with <2 points. */
  netAdded: number | null;
  firstAt: Date | null;
}

/** Fold a Kit overview row + its growth series into the profile's email card. */
export function buildMemberEmailCard(
  row: KitOverviewRow,
  series: { at: Date; value: number }[],
): MemberEmailCard {
  const activeSequences = row.sequences.filter((s) => !s.hold).length;
  const netAdded =
    series.length >= 2 ? series[series.length - 1].value - series[0].value : null;
  return {
    integrationId: row.integrationId,
    clientName: row.clientName,
    accountName: row.accountName,
    plan: row.plan,
    subscriberCount: row.subscriberCount,
    sequenceCount: row.sequenceCount,
    activeSequences,
    tagCount: row.tagCount,
    takenAt: row.takenAt,
    series,
    netAdded,
    firstAt: series[0]?.at ?? null,
  };
}
