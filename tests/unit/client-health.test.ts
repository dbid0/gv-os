import { describe, expect, it } from "vitest";

import { clientHealth, type ClientHealthInput } from "@/lib/clients/health";

const base: ClientHealthInput = {
  cashThisMonthCents: 500_000,
  cashLastMonthCents: 500_000,
  apps30d: 40,
  apps7d: 10,
  eodsLast7d: 20,
  activeReps: 4,
};

describe("clientHealth", () => {
  it("scores a thriving offer healthy", () => {
    const h = clientHealth(base);
    expect(h.score).toBe(100);
    expect(h.band).toBe("healthy");
    expect(h.factors.every((f) => f.ok)).toBe(true);
  });

  it("flags an offer with a dry funnel and no activity as at-risk", () => {
    const h = clientHealth({
      ...base,
      cashThisMonthCents: 100_000,
      cashLastMonthCents: 500_000, // down to 20%
      apps30d: 0,
      apps7d: 0,
      eodsLast7d: 0,
    });
    expect(h.band).toBe("at_risk");
    expect(h.score).toBeLessThan(50);
    expect(h.factors.find((f) => f.key === "apps")?.detail).toBe("funnel dry");
    expect(h.factors.find((f) => f.key === "activity")?.detail).toBe(
      "no EODs this week",
    );
  });

  it("lands in the watch band for a mixed offer", () => {
    const h = clientHealth({
      ...base,
      cashThisMonthCents: 500_000, // steady → 35/35
      apps7d: 0, // dry week → 15/30
      eodsLast7d: 0, // team quiet this week → 0/35
    });
    expect(h.score).toBe(50);
    expect(h.band).toBe("watch");
  });

  it("treats a brand-new offer (no history) neutrally, not as failing", () => {
    const h = clientHealth({
      cashThisMonthCents: 0,
      cashLastMonthCents: 0,
      apps30d: 0,
      apps7d: 0,
      eodsLast7d: 0,
      activeReps: 0,
    });
    // 18 (no cash yet) + 0 (funnel) + 18 (no reps) = 36 → at_risk, but not zero.
    expect(h.score).toBe(36);
    expect(h.factors.find((f) => f.key === "cash")?.detail).toBe("no cash yet");
    expect(h.factors.find((f) => f.key === "activity")?.detail).toBe("no reps yet");
  });

  it("never exceeds the cash cap when this month dwarfs last", () => {
    const h = clientHealth({ ...base, cashThisMonthCents: 5_000_000 });
    expect(h.factors.find((f) => f.key === "cash")?.points).toBe(35);
  });
});
