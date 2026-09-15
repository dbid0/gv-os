import { describe, expect, it } from "vitest";

import { buildAliasMap } from "@/lib/tracking/aliases";
import { cashCatalog, type CatalogPayment } from "@/lib/tracking/cash-catalog";
import { cashMix, mixTotalCents } from "@/lib/tracking/cash-mix";
import { applyTagRulesToFeed, type TagRule } from "@/lib/tracking/tag-rules";
import { windowMoneyFromFeed } from "@/lib/tracking/window-money";

const TZ = "America/Chicago";
const FROM = new Date("2026-09-01T05:00:00Z"); // Sep 1, 00:00 Central
const TO = new Date("2026-10-01T04:59:59.999Z"); // Sep 30, 23:59 Central
const at10 = () => new Date("2026-09-10T16:00:00Z");

function pay(extra: Partial<CatalogPayment>): CatalogPayment {
  return {
    email: "buyer@example.test",
    phone: null,
    cashCents: 10_000,
    status: "succeeded",
    occurredAt: new Date("2026-09-10T15:30:00Z"), // 10:30 Central
    label: null,
    provider: "stripe",
    kind: "charge",
    ...extra,
  };
}

function rule(extra: Partial<TagRule>): TagRule {
  return {
    id: Math.random().toString(36).slice(2),
    tag: "tag",
    matchField: "label",
    matchOp: "contains",
    matchValue: "x",
    countsAsRevenue: true,
    countsAsOptin: false,
    exclude: false,
    excludeFromAov: false,
    hideFromDashboard: false,
    sortOrder: 0,
    active: true,
    ...extra,
  };
}

describe("cashCatalog", () => {
  // Hand-counted September:
  //  a  $1,000 new buyer A, 10:30 Central, labelled "coaching"     → tag coaching
  //  b  $500  buyer A again same day, 10:30 → merged inbox of A    → tag coaching
  //  c  $49   buyer B, "low ticket" (excluded from AOV, tagged)    → tag frontend
  //  d  $200  buyer C, date only (sheet row, midnight UTC)         → unplaceable hour
  //  e  $300  test charge (rule: exclude)                          → hidden
  //  f  -$500 refund for A                                        → refunded
  //  g  $99   failed card                                         → failed
  //  h  $700  August (outside the window)
  //  i  $150  no identity at all                                  → counts, no payer
  const rules: TagRule[] = [
    rule({ tag: "coaching", matchValue: "coaching" }),
    rule({ tag: "frontend", matchValue: "low ticket", excludeFromAov: true }),
    rule({ tag: "test", matchValue: "test", exclude: true }),
  ];
  const payments: CatalogPayment[] = [
    pay({ email: "a@example.test", cashCents: 100_000, label: "coaching" }),
    pay({ email: "a.other@example.test", cashCents: 50_000, label: "Coaching PIF" }),
    pay({ email: "b@example.test", cashCents: 4_900, label: "low ticket" }),
    pay({
      email: "c@example.test",
      cashCents: 20_000,
      provider: "sheet",
      occurredAt: new Date("2026-09-12T00:00:00Z"),
    }),
    pay({ email: "z@example.test", cashCents: 30_000, label: "test charge" }),
    pay({ email: "a@example.test", cashCents: -50_000, status: "refunded" }),
    pay({ email: "d@example.test", cashCents: 9_900, status: "failed" }),
    pay({ email: "a@example.test", occurredAt: new Date("2026-08-20T15:00:00Z") }),
    pay({ email: null, phone: null, cashCents: 15_000, label: null }),
  ];
  const aliases = buildAliasMap([
    { aliasEmail: "a.other@example.test", canonicalEmail: "a@example.test" },
  ]);
  const firstCallAt = new Map([
    // A took a call before paying; C's call came AFTER their payment.
    ["a@example.test", new Date("2026-09-09T20:00:00Z")],
    ["c@example.test", new Date("2026-09-20T20:00:00Z")],
  ]);

  const c = cashCatalog({
    payments,
    rules,
    from: FROM,
    to: TO,
    timeZone: TZ,
    aliases,
    firstCallAt,
    fee: { bps: 290, flatCents: 30 },
  });

  it("equals the dashboard headline: the mix total of the same rule-kept feed", () => {
    const kept = applyTagRulesToFeed(payments, rules).kept;
    expect(c.cashCollectedCents).toBe(mixTotalCents(cashMix(kept, FROM, TO, aliases)));
    expect(c.cashCollectedCents).toBe(189_900);
    expect(c.collectedCount).toBe(5);
  });

  it("counts payers through the alias map, and AOV leaves out excluded-from-AOV money", () => {
    expect(c.payers).toBe(3); // A (two inboxes), B, C — the anonymous payment has no payer
    // AOV = (1,000 + 500 + 200) over A and C
    expect(c.aovCents).toBe(85_000);
  });

  it("places cash on the viewer's days and hours, and never guesses a date-only hour", () => {
    expect(c.byDay).toEqual([
      { day: "2026-09-10", cents: 169_900 },
      { day: "2026-09-11", cents: 20_000 }, // midnight UTC = Sep 11, 7pm Central
    ]);
    expect(c.byHour[10]).toBe(169_900);
    expect(c.unplaceableHourCents).toBe(20_000);
    expect(c.byHour.reduce((s, x) => s + x, 0) + c.unplaceableHourCents).toBe(
      c.cashCollectedCents,
    );
    expect(c.byDay.reduce((s, d) => s + d.cents, 0)).toBe(c.cashCollectedCents);
  });

  it("splits cash by tag and names what no rule matched", () => {
    expect(c.byTag).toEqual([
      { tag: "coaching", cents: 150_000, count: 2 },
      { tag: "frontend", cents: 4_900, count: 1 },
    ]);
    expect(c.untaggedCents).toBe(35_000); // C's $200 + the anonymous $150
  });

  it("shows what rules hid, refunds and failures, windowed", () => {
    expect(c.hidden).toMatchObject({ count: 1, cents: 30_000 });
    expect(c.hidden.byReason.excluded).toEqual({ count: 1, cents: 30_000 });
    expect(c.refundedCents).toBe(50_000);
    expect(c.refundedCount).toBe(1);
    expect(c.failedCount).toBe(1);
  });

  it("names cash with no call on record before it", () => {
    // B, C (call came after) and the anonymous payment
    expect(c.noCallCents).toBe(4_900 + 20_000 + 15_000);
  });

  it("estimates cash after fees only at a stated rate", () => {
    // 2.9% of 189,900 = 5,507.1 → 5,507; plus 30¢ × 5 collected payments
    expect(c.afterFeesEstimateCents).toBe(189_900 - 5_507 - 150);
    const noRate = cashCatalog({
      payments,
      rules,
      from: FROM,
      to: TO,
      timeZone: TZ,
      fee: { bps: null, flatCents: null },
    });
    expect(noRate.afterFeesEstimateCents).toBeNull();
    const flatOnly = cashCatalog({
      payments: [pay({})],
      rules: [],
      from: FROM,
      to: TO,
      timeZone: TZ,
      fee: { bps: null, flatCents: 30 },
    });
    expect(flatOnly.afterFeesEstimateCents).toBe(9_970);
  });

  it("with no active rules, keeps everything untagged and hides nothing", () => {
    const plain = cashCatalog({
      payments,
      rules: [rule({ matchValue: "coaching", active: false })],
      from: FROM,
      to: TO,
      timeZone: TZ,
    });
    expect(plain.hidden.count).toBe(0);
    expect(plain.byTag).toEqual([]);
    expect(plain.untaggedCents).toBe(plain.cashCollectedCents);
    expect(plain.cashCollectedCents).toBe(219_900);
    // No aliases: A's second inbox is its own payer.
    expect(plain.payers).toBe(5);
    expect(plain.noCallCents).toBe(plain.cashCollectedCents);
  });

  it("is honest on an empty window", () => {
    const empty = cashCatalog({
      payments: [],
      rules: [],
      from: FROM,
      to: TO,
      timeZone: TZ,
      fee: null,
    });
    expect(empty).toMatchObject({
      cashCollectedCents: 0,
      payers: 0,
      aovCents: null,
      byDay: [],
      untaggedCents: 0,
      afterFeesEstimateCents: null,
    });
    expect(empty.byHour).toHaveLength(24);
  });

  it("skips hidden payments outside the window and non-positive collected rows", () => {
    const edge = cashCatalog({
      payments: [
        pay({ label: "test", occurredAt: new Date("2026-08-01T12:00:00Z") }),
        pay({ label: "test", occurredAt: null }),
        pay({ cashCents: 0 }),
        pay({ cashCents: null }),
      ],
      rules: [rule({ tag: "test", matchValue: "test", hideFromDashboard: true })],
      from: FROM,
      to: TO,
      timeZone: TZ,
    });
    expect(edge.hidden.count).toBe(0);
    expect(edge.collectedCount).toBe(0);
    expect(edge.cashCollectedCents).toBe(0);
  });

  it("reads a date built at the server's local midnight as date-only too", () => {
    const local = cashCatalog({
      payments: [pay({ occurredAt: new Date(2026, 8, 15) })],
      rules: [],
      from: FROM,
      to: TO,
      timeZone: TZ,
    });
    expect(local.unplaceableHourCents).toBe(10_000);
    expect(local.byHour.every((h) => h === 0)).toBe(true);
  });

  it("handles blank amounts, a percent-only fee, and ties between tags", () => {
    const odd = cashCatalog({
      payments: [
        pay({ label: "internal", cashCents: null }),
        pay({ status: "refunded", cashCents: null }),
        pay({ label: "beta", cashCents: 5_000 }),
        pay({ label: "alpha", cashCents: 5_000 }),
      ],
      rules: [
        rule({ tag: "internal", matchValue: "internal", exclude: true }),
        rule({ tag: "beta", matchValue: "beta" }),
        rule({ tag: "alpha", matchValue: "alpha" }),
      ],
      from: FROM,
      to: TO,
      timeZone: TZ,
      fee: { bps: 300, flatCents: null },
    });
    expect(odd.hidden).toMatchObject({ count: 1, cents: 0 });
    expect(odd.refundedCount).toBe(1);
    expect(odd.refundedCents).toBe(0);
    expect(odd.byTag.map((t) => t.tag)).toEqual(["alpha", "beta"]);
    expect(odd.afterFeesEstimateCents).toBe(10_000 - 300);
  });

  it("reads revenue generated and left to collect exactly as the dashboard hero does", () => {
    const deals = [
      // Sep 10: a $6,000 contract, $1,500 collected so far
      { revenueCents: 600_000, cashCents: 150_000, occurredAt: at10() },
      // no revenue stated: the deal's cash stands in
      { revenueCents: null, cashCents: 20_000, occurredAt: at10() },
      {
        revenueCents: 99_900,
        cashCents: null,
        occurredAt: new Date("2026-08-01T12:00:00Z"),
      },
      { revenueCents: 50_000, cashCents: null, occurredAt: null },
    ];
    const withDeals = cashCatalog({
      payments,
      rules,
      from: FROM,
      to: TO,
      timeZone: TZ,
      aliases,
      deals,
    });
    const kept = applyTagRulesToFeed(payments, rules).kept;
    const hero = windowMoneyFromFeed({ payments: kept, deals, aliases }, FROM, TO, TZ);
    expect(withDeals.revenueGeneratedCents).toBe(hero.revenueCents);
    expect(withDeals.revenueGeneratedCents).toBe(620_000);
    expect(withDeals.leftToCollectCents).toBe(620_000 - 189_900);
    expect(withDeals.dealCount).toBe(2);
    expect(withDeals.revenueByDay).toEqual([{ day: "2026-09-10", cents: 620_000 }]);

    // No deals: revenue is the cash itself and nothing is left to collect.
    expect(c.revenueGeneratedCents).toBe(c.cashCollectedCents);
    expect(c.leftToCollectCents).toBeNull();
    expect(c.dealCount).toBe(0);
    const noneStated = cashCatalog({
      payments: [],
      rules: [],
      from: FROM,
      to: TO,
      timeZone: TZ,
      deals: [{ revenueCents: null, cashCents: null, occurredAt: at10() }],
    });
    expect(noneStated.revenueByDay).toEqual([{ day: "2026-09-10", cents: 0 }]);

    // Days come back in calendar order whatever order the deals arrive in.
    const twoDays = cashCatalog({
      payments: [],
      rules: [],
      from: FROM,
      to: TO,
      timeZone: TZ,
      deals: [
        {
          revenueCents: 30_000,
          cashCents: null,
          occurredAt: new Date("2026-09-20T16:00:00Z"),
        },
        { revenueCents: 10_000, cashCents: null, occurredAt: at10() },
      ],
    });
    expect(twoDays.revenueByDay).toEqual([
      { day: "2026-09-10", cents: 10_000 },
      { day: "2026-09-20", cents: 30_000 },
    ]);
  });

  it("tells hidden-from-dashboard and not-revenue apart", () => {
    const why = cashCatalog({
      payments: [pay({ label: "internal" }), pay({ label: "donation" })],
      rules: [
        rule({ tag: "internal", matchValue: "internal", hideFromDashboard: true }),
        rule({ tag: "donation", matchValue: "donation", countsAsRevenue: false }),
      ],
      from: FROM,
      to: TO,
      timeZone: TZ,
    });
    expect(why.hidden.byReason.hidden).toEqual({ count: 1, cents: 10_000 });
    expect(why.hidden.byReason.not_revenue).toEqual({ count: 1, cents: 10_000 });
  });
});
