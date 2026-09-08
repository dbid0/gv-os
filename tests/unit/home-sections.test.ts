import { describe, expect, it } from "vitest";

import { homeSections, totalCard } from "@/lib/home/sections";
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
  it("pins the slug-less bucket far LEFT even when a client out-earns it", () => {
    const cards = homeSections(
      [
        line({ slug: "big-client", name: "Big Client", cashCents: 9_000_000 }),
        line({ name: "Unattributed", cashCents: 100 }),
      ],
      "Agency — direct",
    );
    expect(cards.map((c) => c.name)).toEqual(["Agency — direct", "Big Client"]);
  });

  it("names the slug-less bucket for the BOOK it belongs to", () => {
    // Client-layer cash that could not be attributed is NOT agency income —
    // putting the agency's label on it reported one book's money as another's.
    const clientBook = homeSections([line({ cashCents: 5_000 })]);
    expect(clientBook[0].name).toBe("Unattributed");
    const agencyBook = homeSections([line({ cashCents: 5_000 })], "Agency — direct");
    expect(agencyBook[0].name).toBe("Agency — direct");
  });

  it("gives an OFF-ROSTER line its own name, never the bucket's", () => {
    const cards = homeSections([
      line({ name: "Unattributed", cashCents: 5_000 }),
      line({ slug: "grid", name: "The Grid", cashCents: 4_000 }),
      line({ name: "Some Old Client", cashCents: 3_000 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual([
      "Unattributed",
      "The Grid",
      "Some Old Client",
    ]);
  });

  it("keeps clients in the ledger's own order after the bucket card", () => {
    const cards = homeSections([
      line({ slug: "a", name: "A", cashCents: 900 }),
      line({ slug: "b", name: "B", cashCents: 500 }),
      line({ name: "Unattributed", cashCents: 1 }),
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Unattributed", "A", "B"]);
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
});

describe("totalCard", () => {
  it("folds a whole book into one card — attributed or not", () => {
    // The All view's agency card: a setup fee ATTRIBUTED to a client is still
    // GV's income, so it belongs in this total, never on the client's card.
    const card = totalCard(
      [
        line({ slug: "visionary", name: "The Visionary", cashCents: 200_000 }),
        line({ name: "Unattributed", cashCents: 50_000, revenueCents: 60_000 }),
      ],
      "Agency — GV income",
    );
    expect(card).toEqual({
      slug: null,
      name: "Agency — GV income",
      cashCents: 250_000,
      revenueCents: 60_000,
    });
  });

  it("is null when the book is empty — no fabricated zero card", () => {
    expect(totalCard([], "Agency — GV income")).toBeNull();
    expect(totalCard([line({ cashCents: 0 })], "x")).toBeNull();
  });
});
