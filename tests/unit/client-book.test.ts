import { describe, expect, it } from "vitest";

import {
  clientBooks,
  UNNAMED_CLIENT,
  type ClientBookDeal,
} from "@/lib/accounting/client-book";
import type { AgencySummary } from "@/lib/accounting/agency-summary";

/** One reconciled row. Figures are fictional — the repo is public. */
const deal = (over: Partial<ClientBookDeal> = {}): ClientBookDeal => ({
  client: "Creator A",
  dateClosed: "2026-09-04",
  revenueCents: 500_000,
  cashCents: 500_000,
  feeCents: 0,
  netCents: 500_000,
  arCents: 0,
  danielCents: 250_000,
  gusCents: 250_000,
  payoutStatus: "Paid Out",
  ...over,
});

const TODAY = "2026-09-17";

const ROSTER = [
  { slug: "offer-a", name: "Offer A" },
  { slug: "offer-b", name: "Offer B" },
];

/** The real matcher's shape: substring, case-insensitive, per slug. */
const ALIASES: Record<string, string[]> = {
  "offer-a": ["creator a"],
  "offer-b": ["creator b"],
};
const matches = (slug: string, sheetClient: string) =>
  (ALIASES[slug] ?? []).some((n) => sheetClient.toLowerCase().includes(n));

const cell = (s: AgencySummary, key: string) =>
  s.sections.flatMap((sec) => sec.rows).find((r) => r.key === key)!;

describe("clientBooks", () => {
  it("names an attributed group after the OFFER, not the sheet's creator name", () => {
    const books = clientBooks([deal({ client: "Creator A" })], TODAY, ROSTER, matches);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ slug: "offer-a", name: "Offer A", dealCount: 1 });
  });

  it("folds two sheet spellings of one creator into one offer", () => {
    // The sheet is typed by hand; "Creator A" and "creator a (renewal)" are
    // the same offer and must not become two lines.
    const books = clientBooks(
      [
        deal({ client: "Creator A", cashCents: 100_000 }),
        deal({ client: "creator a (renewal)", cashCents: 300_000 }),
      ],
      TODAY,
      ROSTER,
      matches,
    );
    expect(books).toHaveLength(1);
    expect(books[0].dealCount).toBe(2);
    expect(books[0].cashCents).toBe(400_000);
  });

  it("keeps an unmatched row on its own line instead of dropping the money", () => {
    const books = clientBooks(
      [deal({ client: "Someone Retired", cashCents: 250_000 })],
      TODAY,
      ROSTER,
      matches,
    );
    expect(books).toEqual([
      expect.objectContaining({
        slug: null,
        name: "Someone Retired",
        cashCents: 250_000,
      }),
    ]);
  });

  it("merges unmatched names that differ only in casing or spacing", () => {
    const books = clientBooks(
      [deal({ client: "Someone Retired" }), deal({ client: "  someone retired " })],
      TODAY,
      ROSTER,
      matches,
    );
    expect(books).toHaveLength(1);
    expect(books[0].dealCount).toBe(2);
    // The first spelling seen is the one shown.
    expect(books[0].name).toBe("Someone Retired");
  });

  it("gives a blank client cell a name so the row still appears", () => {
    const books = clientBooks([deal({ client: "   " })], TODAY, ROSTER, matches);
    expect(books[0]).toMatchObject({ slug: null, name: UNNAMED_CLIENT, dealCount: 1 });
  });

  it("sorts attributed offers first, then by all-time cash", () => {
    const books = clientBooks(
      [
        deal({ client: "Unknown Label", cashCents: 9_000_000 }),
        deal({ client: "Creator A", cashCents: 100_000 }),
        deal({ client: "Creator B", cashCents: 200_000 }),
      ],
      TODAY,
      ROSTER,
      matches,
    );
    // The big unattributed label does NOT outrank a live offer.
    expect(books.map((b) => b.name)).toEqual(["Offer B", "Offer A", "Unknown Label"]);
  });

  it("puts an attributed offer ahead of an unattributed name from either input order", () => {
    // The same two rows fed in both orders must land the same way round —
    // otherwise the page's order depends on the sheet's row order.
    const a = deal({ client: "Creator A", cashCents: 100_000 });
    const b = deal({ client: "Unknown Label", cashCents: 9_000_000 });
    for (const input of [
      [a, b],
      [b, a],
    ]) {
      expect(clientBooks(input, TODAY, ROSTER, matches).map((x) => x.name)).toEqual([
        "Offer A",
        "Unknown Label",
      ]);
    }
  });

  it("breaks a cash tie on name, so the order never wobbles between reads", () => {
    const books = clientBooks(
      [deal({ client: "Creator B" }), deal({ client: "Creator A" })],
      TODAY,
      ROSTER,
      matches,
    );
    expect(books.map((b) => b.name)).toEqual(["Offer A", "Offer B"]);
  });

  it("gives each client the agency book's own arithmetic, and the parts add up", () => {
    const deals = [
      deal({
        client: "Creator A",
        dateClosed: "2026-09-04",
        revenueCents: 500_000,
        cashCents: 300_000,
        netCents: 300_000,
        arCents: 200_000,
        danielCents: 150_000,
        gusCents: 150_000,
        payoutStatus: "Not Yet",
      }),
      deal({
        client: "Creator B",
        dateClosed: "2026-08-25",
        revenueCents: 750_000,
        cashCents: 750_000,
        feeCents: 25_000,
        netCents: 725_000,
        danielCents: 362_500,
        gusCents: 362_500,
      }),
    ];
    const books = clientBooks(deals, TODAY, ROSTER, matches);
    const a = books.find((b) => b.slug === "offer-a")!;
    const b = books.find((b) => b.slug === "offer-b")!;

    expect(cell(a.summary, "cash").thisMonth).toBe(300_000);
    expect(cell(a.summary, "ar").allTime).toBe(200_000);
    expect(cell(a.summary, "unpaid").allTime).toBe(300_000);
    // Creator B closed last month, so its September column is zero, not its cash.
    expect(cell(b.summary, "cash").thisMonth).toBe(0);
    expect(cell(b.summary, "cash").lastMonth).toBe(750_000);
    expect(cell(b.summary, "fees").allTime).toBe(25_000);

    // The whole point of reusing agencySummary: the per-client columns sum to
    // the same all-time figures the front page shows.
    const total = (key: string) =>
      books.reduce((s, x) => s + (cell(x.summary, key).allTime ?? 0), 0);
    expect(total("cash")).toBe(1_050_000);
    expect(total("net")).toBe(1_025_000);
    expect(total("ar")).toBe(200_000);
  });

  it("reads an empty book as no clients, not as one empty client", () => {
    expect(clientBooks([], TODAY, ROSTER, matches)).toEqual([]);
  });
});
