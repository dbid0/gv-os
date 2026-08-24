import { describe, expect, it } from "vitest";

import {
  buildWingmanModel,
  type WingmanCommission,
  type WingmanQuota,
} from "@/lib/home/wingman-model";

const quota = (over: Partial<WingmanQuota>): WingmanQuota => ({
  id: "q",
  metricKey: "deals",
  metricLabel: "Deals closed",
  isMoney: false,
  targetAmount: 10,
  actualSoFar: 4,
  attainmentPct: 0.4,
  remaining: 6,
  status: "on_track",
  isPast: false,
  ...over,
});

const commission: WingmanCommission = {
  owedCents: 250_000,
  commissionCents: 200_000,
  baseCents: 50_000,
  bonusCents: 0,
  skimCents: 0,
  deals: 3,
  paid: false,
  period: "2026-08",
};

describe("buildWingmanModel", () => {
  it("keeps only active quotas and leads with the cash quota", () => {
    const model = buildWingmanModel({
      hasActivity: true,
      streak: { current: 2, longest: 5 },
      pbCount: 3,
      commission,
      quotas: [
        quota({ id: "deals", metricKey: "deals", attainmentPct: 0.4 }),
        quota({
          id: "cash",
          metricKey: "cash_collected",
          isMoney: true,
          targetAmount: 500_000,
          actualSoFar: 350_000,
          attainmentPct: 0.7,
          remaining: 150_000,
          status: "ahead",
        }),
        quota({ id: "old", metricKey: "dials", isPast: true }),
      ],
    });

    expect(model.quotaLines.map((l) => l.id)).toEqual(["deals", "cash"]);
    expect(model.hasQuotas).toBe(true);
    expect(model.primaryAttainmentPct).toBe(0.7); // the cash quota headline
    expect(model.streak).toEqual({ current: 2, longest: 5 });
    expect(model.pbCount).toBe(3);
    expect(model.commission).toBe(commission);
    expect(model.hasActivity).toBe(true);

    const cashLine = model.quotaLines.find((l) => l.id === "cash")!;
    expect(cashLine).toEqual({
      id: "cash",
      metricLabel: "Deals closed",
      isMoney: true,
      target: 500_000,
      soFar: 350_000,
      attainmentPct: 0.7,
      remaining: 150_000,
      status: "ahead",
    });
  });

  it("falls back to the first active quota when there is no cash quota", () => {
    const model = buildWingmanModel({
      hasActivity: false,
      streak: { current: 0, longest: 0 },
      pbCount: 0,
      commission: null,
      quotas: [quota({ id: "dials", metricKey: "dials", attainmentPct: 0.5 })],
    });
    expect(model.primaryAttainmentPct).toBe(0.5);
    expect(model.commission).toBeNull();
  });

  it("shows an honest empty board when every quota is past", () => {
    const model = buildWingmanModel({
      hasActivity: false,
      streak: { current: 0, longest: 0 },
      pbCount: 0,
      commission: null,
      quotas: [quota({ isPast: true }), quota({ id: "q2", isPast: true })],
    });
    expect(model.quotaLines).toEqual([]);
    expect(model.hasQuotas).toBe(false);
    expect(model.primaryAttainmentPct).toBeNull();
  });
});
