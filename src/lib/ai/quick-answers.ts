/**
 * Deterministic quick-answers — the assistant's brain BEFORE the LLM exists.
 *
 * Each function is a pure compute over already-fetched, plainly-shaped inputs:
 * the server read layer pulls the rows, hands them here, and gets back a
 * formatted answer. Nothing here touches a database, a clock, or the network,
 * so every branch — the empty state, the singular, the "target already hit" —
 * is pinned down by tests to 100%, the same bar the money math holds.
 *
 * The answer service (`answer-service.ts`, server-only) is the thin adapter
 * that maps a tool id to the right read function and one of these computes.
 */

import { cents, formatUSD } from "@/lib/money";

export interface QuickAnswer {
  /** The one-line reply the panel leads with. */
  headline: string;
  /** Supporting lines, rendered as a list under the headline. */
  details: string[];
}

// ------------------------------------------------------------------ format

/** Display-only USD from a plain integer-cents number. */
export function usd(nCents: number): string {
  return formatUSD(cents(Math.round(nCents)));
}

/** A count or money value, per the metric's unit. */
export function fmtValue(isMoney: boolean, n: number): string {
  return isMoney ? usd(n) : Math.round(n).toLocaleString("en-US");
}

/** A 0–1 fraction as a whole-number percent. */
export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "1 day" / "2 days" — singular-aware. */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

const PACE_LABEL: Record<PaceStatus, string> = {
  ahead: "ahead of pace",
  on_track: "on track",
  behind: "behind pace",
};

export type PaceStatus = "ahead" | "on_track" | "behind";

/** How many detail lines a list answer will show before it stops. */
export const MAX_LIST_LINES = 6;

// ------------------------------------------------------------------ shapes

/** One rep's active quota, flattened for the compute. */
export interface RepQuotaSnapshot {
  metricLabel: string;
  isMoney: boolean;
  actualSoFar: number;
  targetAmount: number;
  status: PaceStatus;
  remaining: number;
  /** actual ÷ full-period target, 0–1+. */
  attainmentPct: number;
  /** 0–1: how much of the period has elapsed. */
  elapsedFraction: number;
}

// ------------------------------------------------------------------ rep

export function answerRepPacing(input: {
  repName: string;
  quota: RepQuotaSnapshot | null;
}): QuickAnswer {
  const { repName, quota } = input;
  if (!quota) {
    return {
      headline: `No active quota is set for you yet, ${repName}.`,
      details: ["Once a quota lands, I'll track your pace against it here."],
    };
  }
  return {
    headline: `You're ${PACE_LABEL[quota.status]} on ${quota.metricLabel}, ${repName}.`,
    details: [
      `${fmtValue(quota.isMoney, quota.actualSoFar)} of ${fmtValue(quota.isMoney, quota.targetAmount)} (${pct(quota.attainmentPct)} of target).`,
      `${pct(quota.elapsedFraction)} of the period has elapsed.`,
      quota.remaining > 0
        ? `${fmtValue(quota.isMoney, quota.remaining)} still to go.`
        : "Target already hit — keep stacking.",
    ],
  };
}

export function answerRepStreak(input: {
  repName: string;
  current: number;
  longest: number;
  hasActivity: boolean;
}): QuickAnswer {
  const { repName, current, longest, hasActivity } = input;
  if (!hasActivity) {
    return {
      headline: `No activity logged yet, ${repName}.`,
      details: ["Log a call or file an EOD to start your streak."],
    };
  }
  return {
    headline:
      current > 0
        ? `You're on a ${plural(current, "day")} streak, ${repName}.`
        : `Your streak reset, ${repName}.`,
    details: [
      `Longest ever: ${plural(longest, "day")}.`,
      current > 0
        ? "Log something today to keep it alive."
        : "Log today to start a new one.",
    ],
  };
}

export function answerRepEarnings(input: {
  repName: string;
  owedCents: number;
  dealCount: number;
  hasLine: boolean;
}): QuickAnswer {
  const { repName, owedCents, dealCount, hasLine } = input;
  if (!hasLine) {
    return {
      headline: `No commission on the books yet, ${repName}.`,
      details: ["Closed deals carrying your split will show up here."],
    };
  }
  return {
    headline: `You're owed ${usd(owedCents)}, ${repName}.`,
    details: [`Across ${plural(dealCount, "closed deal")}.`],
  };
}

/**
 * A rep's show/close conversion, from disposition-tagged call logs. Rates are
 * 0–1 fractions or null (null until a call resolves either way).
 */
export function answerRepConversion(input: {
  repName: string;
  showRate: number | null;
  closeRate: number | null;
  shows: number;
  sales: number;
  calls: number;
  hasCalls: boolean;
}): QuickAnswer {
  const { repName, showRate, closeRate, shows, sales, calls, hasCalls } = input;
  if (!hasCalls) {
    return {
      headline: `No calls logged yet, ${repName}.`,
      details: ["Log calls and I'll track your show and close rate here."],
    };
  }
  const details: string[] = [];
  if (showRate !== null) details.push(`Show rate: ${pct(showRate)}.`);
  if (closeRate !== null) {
    details.push(
      `Close rate: ${pct(closeRate)} — ${plural(sales, "sale")} from ${plural(shows, "show")}.`,
    );
  }
  details.push(`${plural(calls, "call")} logged so far.`);

  const headline =
    closeRate !== null
      ? `Your close rate is ${pct(closeRate)}, ${repName}.`
      : showRate !== null
        ? `Your show rate is ${pct(showRate)}, ${repName}.`
        : `${plural(calls, "call")} logged, no outcomes resolved yet, ${repName}.`;
  return { headline, details };
}

/**
 * A rep's strongest weekday and top personal record. The record's display value
 * is pre-formatted by the caller so this stays a pure string compute.
 */
export function answerRepBestDay(input: {
  repName: string;
  bestWeekdayLabel: string | null;
  topRecordLabel: string | null;
  topRecordDisplay: string | null;
  hasActivity: boolean;
}): QuickAnswer {
  const { repName, bestWeekdayLabel, topRecordLabel, topRecordDisplay, hasActivity } =
    input;
  if (!hasActivity) {
    return {
      headline: `No activity logged yet, ${repName}.`,
      details: ["Your best day and records show up once you get moving."],
    };
  }
  const headline = bestWeekdayLabel
    ? `${bestWeekdayLabel} is your strongest day, ${repName}.`
    : `You're logging activity, ${repName}.`;
  const details =
    topRecordLabel && topRecordDisplay
      ? [`${topRecordLabel}: ${topRecordDisplay}.`]
      : ["Log more to set your first personal record."];
  return { headline, details };
}

export function answerRepQuotaGap(input: {
  repName: string;
  quota: RepQuotaSnapshot | null;
}): QuickAnswer {
  const { repName, quota } = input;
  if (!quota) {
    return {
      headline: `No quota to chase right now, ${repName}.`,
      details: ["When a quota is set, I'll tell you exactly what's left."],
    };
  }
  if (quota.remaining <= 0) {
    return {
      headline: `Quota already hit, ${repName} — ${fmtValue(quota.isMoney, quota.actualSoFar)} of ${fmtValue(quota.isMoney, quota.targetAmount)}.`,
      details: ["You're ahead of the number. Anything more is upside."],
    };
  }
  return {
    headline: `${fmtValue(quota.isMoney, quota.remaining)} left to hit your ${quota.metricLabel} quota.`,
    details: [
      `You're ${PACE_LABEL[quota.status]} with ${pct(1 - quota.elapsedFraction)} of the period left.`,
    ],
  };
}

// ------------------------------------------------------------------ manager

/** A quota row flattened for the "who's behind" scan. */
export interface PaceRow {
  label: string;
  metricLabel: string;
  status: PaceStatus;
  remaining: number;
  isMoney: boolean;
}

export function answerBehindPace(rows: PaceRow[]): QuickAnswer {
  if (rows.length === 0) {
    return {
      headline: "No quotas are set yet.",
      details: ["Set quotas and I'll flag anyone slipping behind pace."],
    };
  }
  const behind = rows.filter((r) => r.status === "behind");
  if (behind.length === 0) {
    return {
      headline: "Nobody's behind — everyone is on or ahead of pace.",
      details: [],
    };
  }
  return {
    headline: `${plural(behind.length, "quota")} behind pace.`,
    details: behind
      .slice(0, MAX_LIST_LINES)
      .map(
        (r) =>
          `${r.label}: ${fmtValue(r.isMoney, r.remaining)} short on ${r.metricLabel}.`,
      ),
  };
}

export function answerMissedEod(input: {
  asOfLabel: string | null;
  missing: string[];
  submitted: number;
  total: number;
}): QuickAnswer {
  const { asOfLabel, missing, submitted, total } = input;
  if (total === 0) {
    return {
      headline: "No active reps to track EODs for.",
      details: ["Add reps and EOD compliance shows up here."],
    };
  }
  if (asOfLabel === null) {
    return {
      headline: "No EODs have been filed yet.",
      details: [`${total} active ${total === 1 ? "rep" : "reps"} on the board.`],
    };
  }
  if (missing.length === 0) {
    return {
      headline: `All ${total} filed their EOD (${asOfLabel}).`,
      details: [],
    };
  }
  return {
    headline: `${plural(missing.length, "rep")} missed EOD (${asOfLabel}).`,
    details: [
      missing.slice(0, MAX_LIST_LINES).join(", ") +
        (missing.length > MAX_LIST_LINES ? "…" : ""),
      `${submitted}/${total} filed.`,
    ],
  };
}

export function answerCloseRate(input: {
  pct: number | null;
  shows: number;
  deals: number;
}): QuickAnswer {
  if (input.pct === null) {
    return {
      headline: "No shows logged yet — close rate needs shows to compute.",
      details: [],
    };
  }
  return {
    headline: `Close rate is ${input.pct}%.`,
    details: [`${plural(input.deals, "deal")} from ${plural(input.shows, "show")}.`],
  };
}

/** A rep's momentum line, flattened. */
export interface MomentumRow {
  name: string;
  currentStreak: number;
  longestStreak: number;
}

export function answerMomentum(rows: MomentumRow[]): QuickAnswer {
  if (rows.length === 0) {
    return {
      headline: "No rep momentum yet.",
      details: ["Streaks appear as reps log calls, file EODs, and close deals."],
    };
  }
  const onStreak = rows.filter((r) => r.currentStreak > 0);
  if (onStreak.length === 0) {
    return {
      headline: "Nobody's on an active streak right now.",
      details: ["A streak starts the next day someone logs activity."],
    };
  }
  return {
    headline: `${plural(onStreak.length, "rep")} on an active streak.`,
    details: onStreak
      .slice(0, MAX_LIST_LINES)
      .map(
        (r) =>
          `${r.name}: ${plural(r.currentStreak, "day")} (best ${r.longestStreak}).`,
      ),
  };
}

/** One end of the standings: a rep with their collected cash and deal count. */
export interface StandingsRep {
  name: string;
  cashCents: number;
  deals: number;
}

/**
 * The team's top and bottom rep by collected cash. `bottom` is null when there
 * is only one ranked rep, so the answer never pits a rep against themselves.
 */
export function answerTeamStandings(input: {
  top: StandingsRep | null;
  bottom: StandingsRep | null;
  activeCount: number;
}): QuickAnswer {
  const { top, bottom, activeCount } = input;
  if (activeCount === 0 || !top) {
    return {
      headline: "No active reps to rank yet.",
      details: ["Reps appear here once they're on a team with activity."],
    };
  }
  const details = [`${plural(top.deals, "deal")} closed by ${top.name}.`];
  details.push(
    bottom
      ? `Bottom: ${bottom.name} at ${usd(bottom.cashCents)}.`
      : "Only one rep on the board so far.",
  );
  return {
    headline: `${top.name} leads with ${usd(top.cashCents)}.`,
    details,
  };
}

// ------------------------------------------------------------------ admin

export function answerNetThisMonth(input: {
  cents: number;
  monthLabel: string;
}): QuickAnswer {
  return {
    headline: `${usd(input.cents)} collected in ${input.monthLabel}.`,
    details:
      input.cents === 0
        ? ["Nothing recorded yet this month."]
        : ["All-in, across every offer."],
  };
}

/** A failing connection, flattened. */
export interface FailingRow {
  label: string;
  note: string;
}

export function answerWhatsFailing(rows: FailingRow[]): QuickAnswer {
  if (rows.length === 0) {
    return {
      headline: "Everything's syncing clean — nothing failing.",
      details: [],
    };
  }
  return {
    headline: `${plural(rows.length, "connection")} failing.`,
    details: rows.slice(0, MAX_LIST_LINES).map((r) => `${r.label}: ${r.note}`),
  };
}

/** One outstanding-AR line, flattened. */
export interface OwedRow {
  client: string;
  arCents: number;
}

export function answerWhoOwes(input: {
  rows: OwedRow[];
  totalArCents: number;
}): QuickAnswer {
  if (input.rows.length === 0) {
    return {
      headline: "Nothing outstanding — it's all collected.",
      details: [],
    };
  }
  return {
    headline: `${usd(input.totalArCents)} outstanding across ${plural(input.rows.length, "deal")}.`,
    details: input.rows
      .slice(0, MAX_LIST_LINES)
      .map((r) => `${r.client}: ${usd(r.arCents)}.`),
  };
}

/** One rep's owed line in a payout run, flattened. */
export interface PayoutRow {
  name: string;
  owedCents: number;
}

export function answerPayoutOwed(input: {
  reps: PayoutRow[];
  totalOwedCents: number;
}): QuickAnswer {
  const owing = input.reps.filter((r) => r.owedCents > 0);
  if (owing.length === 0 || input.totalOwedCents <= 0) {
    return {
      headline: "Nothing owed to the team right now.",
      details: [],
    };
  }
  return {
    headline: `${usd(input.totalOwedCents)} owed across ${plural(owing.length, "rep")}.`,
    details: owing
      .slice(0, MAX_LIST_LINES)
      .map((r) => `${r.name}: ${usd(r.owedCents)}.`),
  };
}

/** One mirrored deal, flattened for the client month-over-month roll-up. */
export interface ClientTrendDeal {
  client: string;
  /** The close month as "YYYY-MM". */
  monthKey: string;
  netCents: number;
}

/** A client's this-month vs last-month net, with the delta. */
export interface ClientTrendRow {
  client: string;
  thisCents: number;
  lastCents: number;
  deltaCents: number;
}

/**
 * Bucket mirrored deals into this-month vs last-month net per client, ranked by
 * the size of the swing (biggest mover first, then biggest this month). Deals
 * outside the two months are ignored. Pure — the month keys are passed in.
 */
export function bucketClientTrend(
  deals: ClientTrendDeal[],
  thisMonthKey: string,
  lastMonthKey: string,
): ClientTrendRow[] {
  const acc = new Map<string, { thisCents: number; lastCents: number }>();
  for (const d of deals) {
    const isThis = d.monthKey === thisMonthKey;
    const isLast = d.monthKey === lastMonthKey;
    if (!isThis && !isLast) continue;
    const cur = acc.get(d.client) ?? { thisCents: 0, lastCents: 0 };
    if (isThis) cur.thisCents += d.netCents;
    else cur.lastCents += d.netCents;
    acc.set(d.client, cur);
  }
  return [...acc.entries()]
    .map(([client, v]) => ({
      client,
      thisCents: v.thisCents,
      lastCents: v.lastCents,
      deltaCents: v.thisCents - v.lastCents,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || b.thisCents - a.thisCents,
    );
}

/** Which clients are up or down this month versus last. */
export function answerClientTrend(input: {
  rows: ClientTrendRow[];
  thisLabel: string;
  lastLabel: string;
}): QuickAnswer {
  const { rows, thisLabel, lastLabel } = input;
  if (rows.length === 0) {
    return {
      headline: `No client cash to compare for ${thisLabel}.`,
      details: [`Nothing recorded for ${thisLabel} or ${lastLabel} yet.`],
    };
  }
  const up = rows.filter((r) => r.deltaCents > 0).length;
  const down = rows.filter((r) => r.deltaCents < 0).length;
  return {
    headline: `${plural(up, "client")} up, ${down} down vs ${lastLabel}.`,
    details: rows.slice(0, MAX_LIST_LINES).map((r) => {
      const dir =
        r.deltaCents > 0
          ? `up ${usd(r.deltaCents)}`
          : r.deltaCents < 0
            ? `down ${usd(-r.deltaCents)}`
            : "flat";
      return `${r.client}: ${usd(r.thisCents)} this month (${dir}).`;
    }),
  };
}
