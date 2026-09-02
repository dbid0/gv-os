import { describe, expect, it } from "vitest";

import { belongsToClient, rowsForClient } from "@/lib/clients/attribution";

const GRID = "id-grid";
const DEMO_GRID = "id-demo-grid";

const joined = (clientId: string | null) => ({ clientId, description: null });
const sheet = (description: string | null) => ({ clientId: null, description });

describe("belongsToClient", () => {
  it("matches a joined row by ID", () => {
    expect(belongsToClient(joined(GRID), GRID, "the-grid")).toBe(true);
  });

  it("REJECTS a different client record that shares the same display name", () => {
    // The actual defect: two active clients are both named "The Grid", and the
    // demo record's deals were landing in the real client's totals.
    expect(belongsToClient(joined(DEMO_GRID), GRID, "the-grid")).toBe(false);
  });

  it("never falls back to aliases for a row that IS joined", () => {
    // A joined row belongs to its owner even when the description would match
    // this slug's alias — otherwise one row could count for two clients.
    const row = { clientId: DEMO_GRID, description: "Kaden (AI)" };
    expect(belongsToClient(row, GRID, "the-grid")).toBe(false);
  });

  it("keeps the sheet-alias fallback for an UNJOINED import", () => {
    // The sheet records deals under PEOPLE ("Kaden (AI)"), not offer names.
    expect(belongsToClient(sheet("Kaden (AI)"), GRID, "the-grid")).toBe(true);
    expect(belongsToClient(sheet("Snoozer LLC"), GRID, "the-grid")).toBe(false);
  });

  it("drops an unjoined row with no description rather than guessing", () => {
    expect(belongsToClient(sheet(null), GRID, "the-grid")).toBe(false);
  });

  it("attributes nothing to a slug with no client record", () => {
    // clientId unresolved: a joined row cannot be claimed on a name.
    expect(belongsToClient(joined(GRID), null, "unknown-slug")).toBe(false);
  });

  it("still resolves an unjoined row when the client id is unknown", () => {
    expect(belongsToClient(sheet("kaden"), null, "the-grid")).toBe(true);
  });
});

describe("rowsForClient", () => {
  it("keeps only this client's rows and preserves their order", () => {
    const rows = [
      { clientId: GRID, description: null, tag: "a" },
      { clientId: DEMO_GRID, description: null, tag: "b" },
      { clientId: GRID, description: null, tag: "c" },
    ];
    expect(rowsForClient(rows, GRID, "the-grid").map((r) => r.tag)).toEqual(["a", "c"]);
  });

  it("returns nothing rather than everything when the id is unresolved", () => {
    const rows = [joined(GRID), joined(DEMO_GRID)];
    expect(rowsForClient(rows, null, "no-aliases-here")).toEqual([]);
  });
});
