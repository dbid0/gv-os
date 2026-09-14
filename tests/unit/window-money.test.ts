import { describe, expect, it } from "vitest";

import { cashMix, collectedInWindow, mixTotalCents } from "@/lib/tracking/cash-mix";
import type { MixPayment } from "@/lib/tracking/cash-mix";
import {
  buildWorkspaceVariants,
  dealsRevenueInWindow,
  windowMoneyFromFeed,
  type FeedDeal,
} from "@/lib/tracking/window-money";
import type { HomeRow } from "@/lib/transactions/homepage";

const T = (iso: string) => new Date(iso);
const FROM = T("2026-09-01T00:00:00Z");
const TO = T("2026-09-30T23:59:59Z");

// A fabricated payment feed. Windowed collected cash is p1+p2+p4+p5 = $1,780:
// p3 lands before the window, p6 is a refund, p7 failed, p8 is after it.
const PAYMENTS: MixPayment[] = [
  {
    email: "a@x.com",
    cashCents: 100000,
    status: "succeeded",
    occurredAt: T("2026-09-05T10:00:00Z"),
  }, // new
  {
    email: "a@x.com",
    cashCents: 50000,
    status: "succeeded",
    occurredAt: T("2026-09-20T10:00:00Z"),
  }, // same-month recurring
  {
    email: "b@x.com",
    cashCents: 30000,
    status: "succeeded",
    occurredAt: T("2026-08-15T10:00:00Z"),
  }, // b's first — before window
  {
    email: "b@x.com",
    cashCents: 20000,
    status: "succeeded",
    occurredAt: T("2026-09-10T10:00:00Z"),
  }, // after the 1st month
  {
    email: null,
    phone: null,
    cashCents: 8000,
    status: "succeeded",
    occurredAt: T("2026-09-12T10:00:00Z"),
  }, // unplaceable
  {
    email: "c@x.com",
    cashCents: 99999,
    status: "refunded",
    occurredAt: T("2026-09-08T10:00:00Z"),
  }, // refund — never counts
  {
    email: "d@x.com",
    cashCents: 77777,
    status: "failed",
    occurredAt: T("2026-09-09T10:00:00Z"),
  }, // failed — never counts
  {
    email: "e@x.com",
    cashCents: 40000,
    status: "succeeded",
    occurredAt: T("2026-10-05T10:00:00Z"),
  }, // after the window
];

const WINDOW_COLLECTED = 100000 + 50000 + 20000 + 8000; // $1,780

const DEALS: FeedDeal[] = [
  { revenueCents: 300000, cashCents: 100000, occurredAt: T("2026-09-05T10:00:00Z") }, // in window
  { revenueCents: 100000, cashCents: 100000, occurredAt: T("2026-08-01T10:00:00Z") }, // out of window
];

describe("windowed cash = collected-from-snapshot", () => {
  it("collectedInWindow sums exactly the collected, in-window payments", () => {
    expect(collectedInWindow(PAYMENTS, FROM, TO)).toBe(WINDOW_COLLECTED);
  });

  it("the headline (mix total) equals the collected-from-snapshot total — the SAME set", () => {
    const mix = cashMix(PAYMENTS, FROM, TO);
    // Every collected in-window payment lands in exactly one bucket, so the
    // four buckets total the window's collected cash — the headline can never
    // disagree with the bar beneath it.
    expect(mixTotalCents(mix)).toBe(WINDOW_COLLECTED);
    expect(mixTotalCents(mix)).toBe(collectedInWindow(PAYMENTS, FROM, TO));
  });

  it("windowMoneyFromFeed cash IS the mix total, and revenue is the windowed contract value", () => {
    const wm = windowMoneyFromFeed({ payments: PAYMENTS, deals: DEALS }, FROM, TO);
    expect(wm.cashCents).toBe(WINDOW_COLLECTED);
    expect(wm.cashCents).toBe(mixTotalCents(wm.mix));
    // Only the in-window deal counts.
    expect(dealsRevenueInWindow(DEALS, FROM, TO)).toBe(300000);
    expect(wm.revenueCents).toBe(300000);
  });

  it("a window that collected cash NEVER shows $0 cash or $0 revenue", () => {
    // A processor-only feed carries no deals — revenue then equals collected,
    // never a false $0 sitting beneath non-zero cash.
    const wm = windowMoneyFromFeed({ payments: PAYMENTS, deals: [] }, FROM, TO);
    expect(wm.cashCents).toBeGreaterThan(0);
    expect(wm.revenueCents).toBeGreaterThan(0);
    expect(wm.revenueCents).toBe(wm.cashCents);
    // Revenue is floored at cash: "still due" (revenue - cash) can never go
    // negative, whatever the deals feed windows to.
    expect(wm.revenueCents).toBeGreaterThanOrEqual(wm.cashCents);
  });

  it("refunds and failed charges never enter the cash total or the curve", () => {
    const wm = windowMoneyFromFeed({ payments: PAYMENTS, deals: [] }, FROM, TO);
    // 99999 (refund) + 77777 (failed) are excluded.
    expect(wm.cashCents).toBe(WINDOW_COLLECTED);
    // Curve has one point per collected in-window day: 09-05, 09-10, 09-12, 09-20.
    expect(wm.series.map((s) => s.day)).toEqual([
      "2026-09-05",
      "2026-09-10",
      "2026-09-12",
      "2026-09-20",
    ]);
    expect(wm.series.reduce((s, p) => s + p.cents, 0)).toBe(WINDOW_COLLECTED);
  });
});

describe("money-figure invariant — unchanged by the data-freshness fix", () => {
  // The data-freshness work (fresher scheduling, view-refresh, staleness badges,
  // DISTINCT-ON snapshot selection) makes the SAME figure arrive sooner and
  // flags it when stale — it must never change what the figure IS. This locks
  // the collected-cash computation with a fixed, synthetic feed: any drift in
  // buildWindowMoney / cashMix / classifyPayment breaks this exact-integer
  // assertion. (Synthetic amounts only — never a real client figure.)
  const from = T("2026-09-01T00:00:00Z");
  const to = T("2026-09-30T23:59:59Z");
  const feed = {
    payments: [
      {
        email: "one@x.com",
        cashCents: 1_200_000,
        status: "succeeded",
        occurredAt: T("2026-09-03T10:00:00Z"),
      },
      {
        email: "two@x.com",
        cashCents: 800_000,
        status: "succeeded",
        occurredAt: T("2026-09-14T10:00:00Z"),
      },
      {
        email: "three@x.com",
        cashCents: 552_900,
        status: "succeeded",
        occurredAt: T("2026-09-27T10:00:00Z"),
      },
      // A failed charge in the same window — must NEVER enter gross.
      {
        email: "four@x.com",
        cashCents: 999_900,
        status: "failed",
        occurredAt: T("2026-09-20T10:00:00Z"),
      },
    ] as MixPayment[],
    deals: [] as FeedDeal[],
  };
  const EXPECTED_COLLECTED = 1_200_000 + 800_000 + 552_900; // integer cents

  it("collected cash is exactly the sum of the succeeded charges, to the cent", () => {
    const wm = windowMoneyFromFeed(feed, from, to);
    expect(wm.cashCents).toBe(EXPECTED_COLLECTED);
    // The headline equals the mix beneath it — same set, one source.
    expect(wm.cashCents).toBe(mixTotalCents(wm.mix));
    expect(wm.cashCents).toBe(collectedInWindow(feed.payments, from, to));
  });

  it("the failed charge is excluded from gross — never in the number", () => {
    const wm = windowMoneyFromFeed(feed, from, to);
    expect(wm.cashCents).not.toBe(EXPECTED_COLLECTED + 999_900);
    expect(wm.series.reduce((s, p) => s + p.cents, 0)).toBe(EXPECTED_COLLECTED);
  });
});

describe("buildWorkspaceVariants", () => {
  const todayKey = "2026-10-31";

  it("precomputes every preset window from ONE feed, custom included", () => {
    const custom = { from: "2026-09-01", to: "2026-09-30", label: "Custom range" };
    const { variants, custom: customVariant } = buildWorkspaceVariants(
      { payments: PAYMENTS, deals: DEALS },
      [],
      todayKey,
      custom,
    );
    // All time (unbounded, capped at today) is every collected payment.
    expect(variants.life.cashCents).toBe(100000 + 50000 + 30000 + 20000 + 8000 + 40000);
    expect(variants.life.mix).not.toBeNull();
    // The custom September window matches the known windowed collected total.
    expect(customVariant?.cashCents).toBe(WINDOW_COLLECTED);
    expect(customVariant?.revenueCents).toBe(300000);
  });

  it("falls back to the client-layer ledger ONLY when there is no feed", () => {
    const ledger: HomeRow[] = [
      {
        direction: "in",
        layer: "client",
        occurredOn: "2026-10-10",
        cashCents: 12345,
        revenueCents: 20000,
      },
      {
        direction: "in",
        layer: "client",
        occurredOn: "2026-09-10",
        cashCents: 99999,
        revenueCents: 99999,
      },
    ];
    const { variants } = buildWorkspaceVariants(null, ledger, todayKey, null);
    // life sums both ledger rows; the mix is null on the ledger path.
    expect(variants.life.cashCents).toBe(12345 + 99999);
    expect(variants.life.mix).toBeNull();
  });
});
