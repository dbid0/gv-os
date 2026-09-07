import { describe, expect, it } from "vitest";

import { homeSections } from "@/lib/home/sections";
import type { ClientLedgerLine } from "@/lib/transactions/ledger";

function line(over: Partial<ClientLedgerLine>): ClientLedgerLine {
  return {
    slug: null,
    name: "Unattributed",
    count: 1,
    revenueCents: 0,
    cashCents: 0,
    processorFeeCents: 0,
    afterFeesCents: 0,
    ...over,
  };
}

describe("homeSections", () => {
  it("pins the agency card far LEFT even when a client out-earns it", () => {
    const cards = homeSections([
      line({ slug: "big-client", name: "Big Client", cashCents: 9_000_000 }),
      line({ name: "Unattributed", cashCents: 100 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Agency — direct", "Big Client"]);
  });

  it("gives an OFF-ROSTER line its own name, never the agency's", () => {
    // The bug this guards: every slug-less line was renamed "Agency — direct",
    // so an off-roster client's money rendered as a second agency card.
    const cards = homeSections([
      line({ name: "Unattributed", cashCents: 5_000 }),
      line({ slug: "grid", name: "The Grid", cashCents: 4_000 }),
      line({ name: "Some Old Client", cashCents: 3_000 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual([
      "Agency — direct",
      "The Grid",
      "Some Old Client",
    ]);
    expect(cards.filter((c) => c.name === "Agency — direct")).toHaveLength(1);
  });

  it("keeps clients in the ledger's own order after the agency card", () => {
    const cards = homeSections([
      line({ slug: "a", name: "A", cashCents: 900 }),
      line({ slug: "b", name: "B", cashCents: 500 }),
      line({ name: "Unattributed", cashCents: 1 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Agency — direct", "A", "B"]);
  });

  it("drops lines with no money at all, but keeps revenue-only lines", () => {
    const cards = homeSections([
      line({ slug: "quiet", name: "Quiet", cashCents: 0, revenueCents: 0 }),
      line({ slug: "due", name: "Due", cashCents: 0, revenueCents: 5_000 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Due"]);
  });

  it("renders nothing when nobody has money", () => {
    expect(homeSections([])).toEqual([]);
  });

  it("omits the agency card when agency-direct money is zero", () => {
    const cards = homeSections([
      line({ slug: "grid", name: "The Grid", cashCents: 100 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(["The Grid"]);
  });
});
