import { describe, expect, it } from "vitest";

import { assembleRevShareRun, type RevShareOwedInput } from "@/lib/payouts/run";

const owed: RevShareOwedInput[] = [
  { clientId: "grid", clientName: "The Grid", revShareCents: 769_820 },
  { clientId: "vault", clientName: "The Vault", revShareCents: 300_000 },
  { clientId: "zero", clientName: "Quiet Offer", revShareCents: 0 },
];

describe("assembleRevShareRun", () => {
  it("drafts a receivable per client with rev-share owed", () => {
    const drafts = assembleRevShareRun("2026-08", owed, new Set());
    expect(drafts).toHaveLength(2); // the zero-owed client is skipped
    expect(drafts[0]).toEqual({
      month: "2026-08",
      kind: "revshare_received",
      label: "The Grid — rev-share",
      clientId: "grid",
      baseCents: 769_820,
    });
  });

  it("is idempotent — skips a client already on the month's run", () => {
    const drafts = assembleRevShareRun("2026-08", owed, new Set(["grid"]));
    expect(drafts.map((d) => d.clientId)).toEqual(["vault"]);
  });

  it("creates nothing when every client is already generated", () => {
    const drafts = assembleRevShareRun("2026-08", owed, new Set(["grid", "vault"]));
    expect(drafts).toEqual([]);
  });

  it("never drafts a zero or negative receivable", () => {
    const drafts = assembleRevShareRun(
      "2026-08",
      [{ clientId: "x", clientName: "X", revShareCents: -5 }],
      new Set(),
    );
    expect(drafts).toEqual([]);
  });
});
