import { describe, expect, it } from "vitest";

import {
  canSupply,
  collectConflicts,
  resolveFact,
  sourceRank,
  type Candidate,
  paymentSourceGaps,
  processorMatchesSource,
} from "@/lib/tracking/sources";

const d = (iso: string) => new Date(iso);

describe("ownership", () => {
  it("puts the system that PERFORMED the thing above the sheet", () => {
    // The whole point: a rep retyping a booking cannot outrank the calendar
    // that created it.
    expect(sourceRank("booking", "calendly")).toBeGreaterThan(
      sourceRank("booking", "sheet"),
    );
    expect(sourceRank("payment", "stripe")).toBeGreaterThan(
      sourceRank("payment", "sheet"),
    );
    expect(sourceRank("callActivity", "close")).toBeGreaterThan(
      sourceRank("callActivity", "sheet"),
    );
  });

  it("keeps the CLOSER's own account of the outcome above any API", () => {
    // No API knows whether the prospect said yes. The human on the call does.
    expect(sourceRank("callOutcome", "sheet")).toBeGreaterThan(
      sourceRank("callOutcome", "close"),
    );
  });

  it("refuses to let a source speak to something it cannot know", () => {
    // Stripe has no opinion on when a call was booked, and asking it for one
    // is how a wrong number gets an authoritative-looking label.
    expect(canSupply("booking", "stripe")).toBe(false);
    expect(canSupply("callActivity", "whop")).toBe(false);
    expect(canSupply("payment", "calendly")).toBe(false);
  });

  it("lets the sheet answer every kind, and win none it does not own", () => {
    for (const kind of [
      "identity",
      "application",
      "booking",
      "callActivity",
      "payment",
      "recording",
    ] as const) {
      expect(canSupply(kind, "sheet")).toBe(true);
      expect(sourceRank(kind, "sheet")).toBeLessThan(5);
    }
  });
});

describe("resolveFact", () => {
  it("takes the live system's value over the sheet's", () => {
    const r = resolveFact(
      "booking",
      [
        { source: "sheet", value: d("2026-09-01T00:00:00Z") },
        { source: "calendly", value: d("2026-09-01T15:30:00Z") },
      ] as Candidate<Date>[],
      (a, b) => a.getTime() === b.getTime(),
    );
    expect(r.source).toBe("calendly");
    expect(r.value?.toISOString()).toBe("2026-09-01T15:30:00.000Z");
  });

  it("FILLS a gap from the sheet when the owner is silent", () => {
    // This is the case that matters today: the sheet is all there is.
    const r = resolveFact("booking", [
      { source: "calendly", value: null },
      { source: "sheet", value: d("2026-09-01T00:00:00Z") },
    ] as Candidate<Date>[]);
    expect(r.source).toBe("sheet");
    expect(r.filledGap).toBe(true);
  });

  it("does not call it a filled gap when the owner answered", () => {
    const r = resolveFact("payment", [
      { source: "stripe", value: 250_000 },
      { source: "sheet", value: 250_000 },
    ]);
    expect(r.source).toBe("stripe");
    expect(r.filledGap).toBe(false);
  });

  it("REPORTS a disagreement instead of hiding it", () => {
    // Two systems disagreeing about money is a real problem in the business,
    // not a rendering detail.
    const r = resolveFact("payment", [
      { source: "stripe", value: 250_000 },
      { source: "sheet", value: 300_000 },
    ]);
    expect(r.value).toBe(250_000);
    expect(r.conflictingSources).toEqual(["sheet"]);
  });

  it("reports no conflict when the sources agree", () => {
    const r = resolveFact("payment", [
      { source: "stripe", value: 250_000 },
      { source: "sheet", value: 250_000 },
    ]);
    expect(r.conflictingSources).toEqual([]);
  });

  it("ignores a source with no standing for that fact", () => {
    // Stripe cannot date a booking, so its value is not even considered.
    const r = resolveFact("booking", [
      { source: "stripe", value: d("2020-01-01T00:00:00Z") },
      { source: "sheet", value: d("2026-09-01T00:00:00Z") },
    ] as Candidate<Date>[]);
    expect(r.source).toBe("sheet");
    expect(r.conflictingSources).toEqual([]);
  });

  it("breaks an equal-rank tie by the most recent observation", () => {
    const r = resolveFact("payment", [
      { source: "whop", value: 100, observedAt: d("2026-09-01T00:00:00Z") },
      { source: "stripe", value: 200, observedAt: d("2026-09-02T00:00:00Z") },
    ]);
    expect(r.value).toBe(200);
    expect(r.source).toBe("stripe");
  });

  it("returns nothing, not a guess, when nobody knew", () => {
    const r = resolveFact("booking", [
      { source: "calendly", value: null },
      { source: "sheet", value: null },
    ] as Candidate<Date>[]);
    expect(r.value).toBeNull();
    expect(r.source).toBeNull();
    expect(r.filledGap).toBe(false);
  });

  it("handles an empty candidate list", () => {
    expect(resolveFact("payment", []).value).toBeNull();
  });
});

describe("collectConflicts", () => {
  it("surfaces every disagreement with its winner and losers", () => {
    const payment = resolveFact("payment", [
      { source: "stripe", value: 250_000 },
      { source: "sheet", value: 300_000 },
    ]);
    const booking = resolveFact("booking", [
      { source: "calendly", value: 1 },
      { source: "sheet", value: 1 },
    ]);
    const out = collectConflicts([
      { kind: "payment", field: "cashCents", result: payment },
      { kind: "booking", field: "occurredAt", result: booking },
    ]);
    expect(out).toEqual([
      { kind: "payment", field: "cashCents", winner: "stripe", losers: ["sheet"] },
    ]);
  });

  it("is empty when everything agrees", () => {
    const r = resolveFact("payment", [{ source: "stripe", value: 1 }]);
    expect(collectConflicts([{ kind: "payment", field: "x", result: r }])).toEqual([]);
  });
});

describe("paymentSourceGaps", () => {
  it("is null until a second source reports — one record has nothing to disagree with", () => {
    expect(paymentSourceGaps([{ source: "sheet", netCents: 100 }])).toBeNull();
    expect(paymentSourceGaps([])).toBeNull();
  });

  it("the processor is the authority whatever the numbers say", () => {
    // The sheet showing MORE money must not make it the authority — rank
    // decides, not size.
    const gaps = paymentSourceGaps([
      { source: "sheet", netCents: 999_999 },
      { source: "stripe", netCents: 500_000 },
    ]);
    expect(gaps).toEqual([{ authority: "stripe", other: "sheet", gapCents: -499_999 }]);
  });

  it("positive gap = the lesser source is missing money", () => {
    const gaps = paymentSourceGaps([
      { source: "stripe", netCents: 4_870_500 },
      { source: "sheet", netCents: 4_388_200 },
    ]);
    expect(gaps?.[0].gapCents).toBe(482_300);
  });

  it("a source with no standing on payments is ignored", () => {
    // Fathom knows recordings, not money — its presence must not create a
    // fake disagreement.
    expect(
      paymentSourceGaps([
        { source: "stripe", netCents: 100 },
        { source: "fathom", netCents: 0 },
      ]),
    ).toBeNull();
  });
});

describe("processorMatchesSource", () => {
  it("matches the sheet's processor cell to its source, case-insensitively", () => {
    expect(processorMatchesSource("Stripe", "stripe")).toBe(true);
    expect(processorMatchesSource("  stripe ", "stripe")).toBe(true);
  });

  it("keeps another processor's money OUT of the comparison", () => {
    // A sheet logging Shopify beside Stripe is knowledge, not disagreement.
    expect(processorMatchesSource("Shopify", "stripe")).toBe(false);
  });

  it("knows Fanbasis also goes by Commas", () => {
    expect(processorMatchesSource("Commas", "fanbasis")).toBe(true);
    expect(processorMatchesSource("Fanbasis", "fanbasis")).toBe(true);
  });

  it("an unrecorded processor never matches — no guessing", () => {
    expect(processorMatchesSource(null, "stripe")).toBe(false);
    expect(processorMatchesSource("", "stripe")).toBe(false);
  });
});
