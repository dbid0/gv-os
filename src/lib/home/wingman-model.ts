/**
 * Wingman home model — pure, deterministic, and 100% covered.
 *
 * The rep's home ("Wingman") is their own day at a glance: how their quota is
 * pacing, their streak and personal-best count, the commission they are owed,
 * and a way straight into logging work. Every figure is DERIVED — quota pacing
 * from the fully covered engine, streak/PBs from gamification, commission from
 * the payout rollup — so nothing here is invented.
 *
 * This file only shapes already-fetched, already-scoped plain data into the view
 * model; the server layer does the DB reads. No clock, no database, no money
 * branding — cents are plain integers, formatted for display upstream.
 */

// ---------------------------------------------------------------- Inputs

/** One of the rep's quotas, its pacing already computed by the quota engine. */
export interface WingmanQuota {
  id: string;
  /** The metric key (cash_collected · deals · dials …), to pick the headline. */
  metricKey: string;
  metricLabel: string;
  isMoney: boolean;
  targetAmount: number;
  actualSoFar: number;
  attainmentPct: number;
  remaining: number;
  status: "ahead" | "on_track" | "behind";
  isPast: boolean;
}

/** The rep's commission position for the current payout run. */
export interface WingmanCommission {
  owedCents: number;
  commissionCents: number;
  baseCents: number;
  bonusCents: number;
  skimCents: number;
  deals: number;
  paid: boolean;
  period: string;
}

export interface WingmanStreak {
  current: number;
  longest: number;
}

export interface WingmanInput {
  hasActivity: boolean;
  streak: WingmanStreak;
  pbCount: number;
  quotas: WingmanQuota[];
  commission: WingmanCommission | null;
}

// ---------------------------------------------------------------- Outputs

export interface WingmanQuotaLine {
  id: string;
  metricLabel: string;
  isMoney: boolean;
  target: number;
  soFar: number;
  attainmentPct: number;
  remaining: number;
  status: "ahead" | "on_track" | "behind";
}

export interface WingmanModel {
  /** The rep's active (not-past) quotas, as lines. */
  quotaLines: WingmanQuotaLine[];
  /** The headline attainment: the cash quota if there is one, else the first. */
  primaryAttainmentPct: number | null;
  streak: WingmanStreak;
  pbCount: number;
  commission: WingmanCommission | null;
  hasActivity: boolean;
  hasQuotas: boolean;
}

// ---------------------------------------------------------------- Build

const PRIMARY_METRIC = "cash_collected";

function toLine(q: WingmanQuota): WingmanQuotaLine {
  return {
    id: q.id,
    metricLabel: q.metricLabel,
    isMoney: q.isMoney,
    target: q.targetAmount,
    soFar: q.actualSoFar,
    attainmentPct: q.attainmentPct,
    remaining: q.remaining,
    status: q.status,
  };
}

/**
 * The headline quota: a rep leads with money, so the cash-collected quota wins
 * when present; otherwise the first active quota stands in. Null when the rep
 * has no active quota to pace against.
 */
function primaryQuota(active: WingmanQuota[]): WingmanQuota | null {
  if (active.length === 0) return null;
  return active.find((q) => q.metricKey === PRIMARY_METRIC) ?? active[0];
}

/** Fold the rep's fetched rows into the Wingman view model. */
export function buildWingmanModel(input: WingmanInput): WingmanModel {
  const active = input.quotas.filter((q) => !q.isPast);
  const primary = primaryQuota(active);

  return {
    quotaLines: active.map(toLine),
    primaryAttainmentPct: primary ? primary.attainmentPct : null,
    streak: input.streak,
    pbCount: input.pbCount,
    commission: input.commission,
    hasActivity: input.hasActivity,
    hasQuotas: active.length > 0,
  };
}
