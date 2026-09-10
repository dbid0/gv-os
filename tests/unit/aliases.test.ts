import { describe, expect, it } from "vitest";

import { buildAliasMap, resolveEmail } from "@/lib/tracking/aliases";
import { cashMix } from "@/lib/tracking/cash-mix";

const T = (iso: string) => new Date(iso);

describe("buildAliasMap / resolveEmail", () => {
  it("resolves an alias to its canonical, normalized", () => {
    const map = buildAliasMap([
      { aliasEmail: " Pay@Gmail.com ", canonicalEmail: "Lead@Gmail.com" },
    ]);
    expect(resolveEmail("pay@gmail.com", map)).toBe("lead@gmail.com");
    expect(resolveEmail("PAY@GMAIL.COM", map)).toBe("lead@gmail.com");
  });

  it("an unmapped email resolves to itself", () => {
    expect(resolveEmail("solo@x.com", new Map())).toBe("solo@x.com");
  });

  it("resolution is ONE hop — chains are not followed", () => {
    // b→c exists, but a→b resolves to b, not c. One wrong merge damages one
    // link, never everything transitively attached.
    const map = buildAliasMap([
      { aliasEmail: "a@x.com", canonicalEmail: "b@x.com" },
      { aliasEmail: "b@x.com", canonicalEmail: "c@x.com" },
    ]);
    expect(resolveEmail("a@x.com", map)).toBe("b@x.com");
    expect(resolveEmail("b@x.com", map)).toBe("c@x.com");
  });

  it("cycles cannot loop — one hop by construction", () => {
    const map = buildAliasMap([
      { aliasEmail: "a@x.com", canonicalEmail: "b@x.com" },
      { aliasEmail: "b@x.com", canonicalEmail: "a@x.com" },
    ]);
    expect(resolveEmail("a@x.com", map)).toBe("b@x.com");
  });

  it("self-mappings and blanks are dropped; first mapping wins", () => {
    const map = buildAliasMap([
      { aliasEmail: "a@x.com", canonicalEmail: "a@x.com" },
      { aliasEmail: "", canonicalEmail: "c@x.com" },
      { aliasEmail: "d@x.com", canonicalEmail: "one@x.com" },
      { aliasEmail: "d@x.com", canonicalEmail: "two@x.com" },
    ]);
    expect(resolveEmail("a@x.com", map)).toBe("a@x.com");
    expect(resolveEmail("d@x.com", map)).toBe("one@x.com");
  });

  it("null/empty input stays null", () => {
    expect(resolveEmail(null, new Map())).toBeNull();
    expect(resolveEmail("  ", new Map())).toBeNull();
  });
});

describe("cashMix with aliases", () => {
  it("two inboxes, one person: aliased payments key to ONE payer", () => {
    const history = [
      {
        email: "lead@x.com",
        phone: null,
        cashCents: 100000,
        status: "succeeded",
        occurredAt: T("2026-08-15T12:00:00Z"),
      },
      {
        email: "pay@x.com", // same human, paying inbox
        phone: null,
        cashCents: 50000,
        status: "succeeded",
        occurredAt: T("2026-09-05T12:00:00Z"),
      },
    ];
    const from = T("2026-09-01T00:00:00Z");
    const to = T("2026-09-30T23:59:59Z");

    // Without the alias they read as a NEW payer in September.
    const blind = cashMix(history, from, to);
    expect(blind.newCents).toBe(50000);

    // With the alias, September's payment is the SAME person returning.
    const aliases = buildAliasMap([
      { aliasEmail: "pay@x.com", canonicalEmail: "lead@x.com" },
    ]);
    const aware = cashMix(history, from, to, aliases);
    expect(aware.newCents).toBe(0);
    expect(aware.afterFirstMonthCents).toBe(50000);
    expect(aware.returningPayers).toBe(1);
  });
});
