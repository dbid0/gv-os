/**
 * Client health — a single 0-100 score per offer that says, at a glance, whether
 * a client is thriving or drifting toward churn. Pure and interpretable: three
 * weighted signals (is money growing, is the funnel feeding, is the team
 * active), each contributing points with a plain-English reason, so the number
 * is never a black box.
 */

export interface ClientHealthInput {
  cashThisMonthCents: number;
  cashLastMonthCents: number;
  /** Applications in over the last 30 / 7 days. */
  apps30d: number;
  apps7d: number;
  /** EOD reports filed by this offer's reps in the last 7 days. */
  eodsLast7d: number;
  activeReps: number;
}

export interface HealthFactor {
  key: "cash" | "apps" | "activity";
  label: string;
  /** Points this factor contributed. */
  points: number;
  max: number;
  ok: boolean;
  detail: string;
}

export type HealthBand = "healthy" | "watch" | "at_risk";

export interface ClientHealth {
  score: number;
  band: HealthBand;
  factors: HealthFactor[];
}

const CASH_MAX = 35;
const APPS_MAX = 30;
const ACTIVITY_MAX = 35;

export function clientHealth(i: ClientHealthInput): ClientHealth {
  const factors: HealthFactor[] = [];

  // Cash trend — this month against last. A growing/steady book scores full;
  // a shrinking one bleeds points in proportion.
  let cashPoints: number;
  let cashOk: boolean;
  let cashDetail: string;
  if (i.cashLastMonthCents > 0) {
    const ratio = i.cashThisMonthCents / i.cashLastMonthCents;
    cashPoints = Math.max(0, Math.min(CASH_MAX, Math.round(CASH_MAX * ratio)));
    cashOk = ratio >= 0.85;
    cashDetail =
      ratio >= 1 ? "up vs last month" : `${Math.round(ratio * 100)}% of last month`;
  } else {
    cashPoints = i.cashThisMonthCents > 0 ? 30 : 18;
    cashOk = i.cashThisMonthCents > 0;
    cashDetail = i.cashThisMonthCents > 0 ? "collecting" : "no cash yet";
  }
  factors.push({
    key: "cash",
    label: "Cash trend",
    points: cashPoints,
    max: CASH_MAX,
    ok: cashOk,
    detail: cashDetail,
  });

  // Funnel — fresh applications keep the pipeline alive; a dry week is a warning.
  const appsPoints = i.apps7d > 0 ? APPS_MAX : i.apps30d > 0 ? 15 : 0;
  factors.push({
    key: "apps",
    label: "Applications",
    points: appsPoints,
    max: APPS_MAX,
    ok: i.apps7d > 0,
    detail:
      i.apps7d > 0
        ? `${i.apps7d} this week`
        : i.apps30d > 0
          ? "none this week"
          : "funnel dry",
  });

  // Rep activity — a team that's filing EODs is working the offer.
  let actPoints: number;
  let actOk: boolean;
  let actDetail: string;
  if (i.activeReps === 0) {
    actPoints = 18;
    actOk = false;
    actDetail = "no reps yet";
  } else if (i.eodsLast7d > 0) {
    actPoints = ACTIVITY_MAX;
    actOk = true;
    actDetail = `${i.eodsLast7d} EODs this week`;
  } else {
    actPoints = 0;
    actOk = false;
    actDetail = "no EODs this week";
  }
  factors.push({
    key: "activity",
    label: "Rep activity",
    points: actPoints,
    max: ACTIVITY_MAX,
    ok: actOk,
    detail: actDetail,
  });

  const score = factors.reduce((s, f) => s + f.points, 0);
  const band: HealthBand = score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk";
  return { score, band, factors };
}
