import { describe, expect, it } from "vitest";

import { buildTeamsOverview, type OverviewLine } from "@/lib/teams-overview";

const lines: OverviewLine[] = [
  { slug: "the-grid", name: "The Grid", cashCents: 2_349_400, revenueCents: 2_600_000 },
  { slug: "the-vault", name: "The Vault", cashCents: 0, revenueCents: 0 },
  {
    slug: "racks-closes",
    name: "Racks Closes",
    cashCents: 2_720_500,
    revenueCents: 2_720_500,
  },
  { slug: null, name: "Unattributed", cashCents: 50_000, revenueCents: 50_000 },
];

describe("buildTeamsOverview", () => {
  it("folds totals from the same lines that feed the chips", () => {
    const o = buildTeamsOverview(lines, 19, 26);
    expect(o.cashCents).toBe(2_349_400 + 0 + 2_720_500 + 50_000);
    expect(o.revenueCents).toBe(2_600_000 + 0 + 2_720_500 + 50_000);
    expect(o.deals).toBe(19);
    expect(o.closeRatePct).toBe(26);
  });

  it("chips only attributed teams, largest cash first", () => {
    const o = buildTeamsOverview(lines, 19, 26);
    expect(o.teams.map((t) => t.slug)).toEqual([
      "racks-closes",
      "the-grid",
      "the-vault",
    ]);
    expect(o.teams.every((t) => t.slug !== null)).toBe(true);
  });

  it("surfaces unattributed cash instead of hiding it", () => {
    const o = buildTeamsOverview(lines, 19, 26);
    expect(o.unattributedCents).toBe(50_000);
  });

  it("passes a null close rate through untouched (no fake 0%)", () => {
    const o = buildTeamsOverview([], 0, null);
    expect(o.closeRatePct).toBeNull();
    expect(o.cashCents).toBe(0);
    expect(o.teams).toEqual([]);
    expect(o.unattributedCents).toBe(0);
  });
});
