/**
 * THE CASH CATALOG — every cash number the offer's payment feed can answer.
 *
 * The reference product's money metrics, built on the SAME feed and the SAME
 * rules as the dashboard headline: the offer's payment feed (the processor
 * snapshot, else the sheet), run through the offer's tag rules, windowed on the
 * viewer's calendar. Cash collected here is the cash mix's own total, so it is
 * equal to the dashboard's headline by construction (tested).
 *
 * Definitions (each tested):
 * - cashCollected      collected money in the window after tag rules = mixTotalCents
 * - payers / aov       distinct payers (alias-resolved, the mix's key); average
 *                      order = cash ÷ payers, leaving out payments a rule marks
 *                      "exclude from AOV" and payers with no identity
 * - byDay / byHour     collected cash per viewer day / hour of day; a payment
 *                      at exact midnight is a sheet date with no time and sits
 *                      in unplaceableHourCents, never guessed into an hour
 * - byTag / untagged   collected cash per rule tag (a payment with two tags
 *                      counts under both) / cash no rule matched
 * - hidden             payments tag rules took out of the dashboard, windowed,
 *                      per reason — shown, never silently dropped
 * - refunded / failed  money that went back / charges that failed, windowed
 * - noCall             collected cash from payers with no booked call that
 *                      started on or before the payment (a direct buyer)
 * - afterFeesEstimate  cash minus the offer's own fee rate (bps + flat per
 *                      collected payment); null when no rate is set
 *
 * Pure: no clock, no database.
 */

import { EMPTY_ALIASES, resolveEmail, type AliasMap } from "@/lib/tracking/aliases";
import {
  cashMix,
  mixTotalCents,
  payerKeyOf,
  type MixPayment,
} from "@/lib/tracking/cash-mix";
import { classifyPayment } from "@/lib/tracking/refunds";
import {
  classifyPayment as classifyTags,
  dashboardHiddenReason,
  toTaggable,
  type HiddenReason,
  type RuleablePayment,
  type TagRule,
} from "@/lib/tracking/tag-rules";
import { dayKeyIn } from "@/lib/time/zone";

export type CatalogPayment = MixPayment & RuleablePayment;

export type CashCatalog = {
  cashCollectedCents: number;
  collectedCount: number;
  payers: number;
  aovCents: number | null;
  byDay: { day: string; cents: number }[];
  byHour: number[];
  unplaceableHourCents: number;
  byTag: { tag: string; cents: number; count: number }[];
  untaggedCents: number;
  hidden: {
    count: number;
    cents: number;
    byReason: Record<HiddenReason, { count: number; cents: number }>;
  };
  refundedCents: number;
  refundedCount: number;
  failedCount: number;
  noCallCents: number;
  afterFeesEstimateCents: number | null;
};

export type FeeRate = { bps: number | null; flatCents: number | null };

const hourFmt = new Map<string, Intl.DateTimeFormat>();
function hourIn(d: Date, timeZone: string): number {
  let fmt = hourFmt.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    });
    hourFmt.set(timeZone, fmt);
  }
  return Number(fmt.format(d)) % 24;
}

/**
 * A sheet date with no time: the parser builds it at the server's local
 * midnight (UTC in production). A processor charge always carries minutes and
 * seconds, so exact midnight in either zone reads as "a date, no time".
 */
const isDateOnly = (d: Date): boolean =>
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0 &&
  [d.getUTCHours(), d.getHours()].includes(0);

export function cashCatalog(input: {
  /** The offer's whole payment feed, before tag rules. */
  payments: CatalogPayment[];
  rules: TagRule[];
  from: Date;
  to: Date;
  timeZone: string;
  aliases?: AliasMap;
  /** Earliest booked call start per invitee email (lowercased). */
  firstCallAt?: Map<string, Date>;
  fee?: FeeRate | null;
}): CashCatalog {
  const aliases = input.aliases ?? EMPTY_ALIASES;
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const inWindow = (p: CatalogPayment) =>
    p.occurredAt !== null &&
    p.occurredAt.getTime() >= fromMs &&
    p.occurredAt.getTime() <= toMs;

  const kept: CatalogPayment[] = [];
  const verdictOf = new Map<CatalogPayment, ReturnType<typeof classifyTags>>();
  const hidden: CashCatalog["hidden"] = {
    count: 0,
    cents: 0,
    byReason: {
      excluded: { count: 0, cents: 0 },
      hidden: { count: 0, cents: 0 },
      not_revenue: { count: 0, cents: 0 },
    },
  };
  const anyRule = input.rules.some((r) => r.active);

  for (const p of input.payments) {
    const verdict = anyRule ? classifyTags(toTaggable(p), input.rules) : null;
    const reason = verdict ? dashboardHiddenReason(verdict) : null;
    if (reason === null) {
      kept.push(p);
      if (verdict) verdictOf.set(p, verdict);
      continue;
    }
    if (!inWindow(p)) continue;
    const cash = Math.abs(p.cashCents ?? 0);
    hidden.count += 1;
    hidden.cents += cash;
    hidden.byReason[reason].count += 1;
    hidden.byReason[reason].cents += cash;
  }

  const mix = cashMix(kept, input.from, input.to, aliases);
  const cashCollectedCents = mixTotalCents(mix);

  const byDay = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  const byTag = new Map<string, { cents: number; count: number }>();
  const payers = new Set<string>();
  const aovPayers = new Set<string>();
  let aovCash = 0;
  let unplaceableHourCents = 0;
  let untaggedCents = 0;
  let collectedCount = 0;
  let refundedCents = 0;
  let refundedCount = 0;
  let failedCount = 0;
  let noCallCents = 0;

  for (const p of kept) {
    if (!inWindow(p)) continue;
    const outcome = classifyPayment({ cashCents: p.cashCents, status: p.status });
    if (outcome === "refunded") {
      refundedCount += 1;
      refundedCents += Math.abs(p.cashCents ?? 0);
      continue;
    }
    if (outcome === "failed") {
      failedCount += 1;
      continue;
    }
    const cents = p.cashCents ?? 0;
    if (cents <= 0) continue;
    const at = p.occurredAt as Date;
    collectedCount += 1;

    const day = dayKeyIn(at, input.timeZone);
    byDay.set(day, (byDay.get(day) ?? 0) + cents);
    if (isDateOnly(at)) unplaceableHourCents += cents;
    else byHour[hourIn(at, input.timeZone)] += cents;

    const verdict = verdictOf.get(p);
    if (!verdict || verdict.matchedRuleIds.length === 0) untaggedCents += cents;
    for (const tag of verdict?.tags ?? []) {
      const t = byTag.get(tag) ?? { cents: 0, count: 0 };
      t.cents += cents;
      t.count += 1;
      byTag.set(tag, t);
    }

    const key = payerKeyOf(p, aliases);
    if (key) {
      payers.add(key);
      if (!verdict?.excludeFromAov) {
        aovPayers.add(key);
        aovCash += cents;
      }
    }

    const email = resolveEmail(p.email ?? null, aliases);
    const firstCall = email ? input.firstCallAt?.get(email) : undefined;
    if (!firstCall || firstCall.getTime() > at.getTime()) noCallCents += cents;
  }

  const fee = input.fee;
  const hasRate = fee && (fee.bps !== null || fee.flatCents !== null);
  const feeCents = hasRate
    ? Math.round((cashCollectedCents * (fee.bps ?? 0)) / 10_000) +
      (fee.flatCents ?? 0) * collectedCount
    : 0;

  return {
    cashCollectedCents,
    collectedCount,
    payers: payers.size,
    aovCents: aovPayers.size > 0 ? Math.round(aovCash / aovPayers.size) : null,
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, cents]) => ({ day, cents })),
    byHour,
    unplaceableHourCents,
    byTag: [...byTag.entries()]
      .map(([tag, t]) => ({ tag, ...t }))
      .sort((a, b) => b.cents - a.cents || a.tag.localeCompare(b.tag)),
    untaggedCents,
    hidden,
    refundedCents,
    refundedCount,
    failedCount,
    noCallCents,
    afterFeesEstimateCents: hasRate ? cashCollectedCents - feeCents : null,
  };
}
