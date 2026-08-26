import { describe, expect, it } from "vitest";

import {
  assemblePartnerSplit,
  assembleRevShareRun,
  type RevShareOwedInput,
} from "@/lib/payouts/run";

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

describe("assemblePartnerSplit", () => {
  it("splits net 50/50 into two penny-exact partner rows", () => {
    const drafts = assemblePartnerSplit("2026-08", 1_000_001, false);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.kind)).toEqual(["partner", "partner"]);
    expect(drafts.map((d) => d.clientId)).toEqual([null, null]);
    // The two halves always sum back to the net — no penny lost or invented.
    expect(drafts[0].baseCents + drafts[1].baseCents).toBe(1_000_001);
    expect(drafts[0].label).toContain("Daniel");
    expect(drafts[1].label).toContain("Gus");
  });

  it("creates nothing when the month already has partner rows", () => {
    expect(assemblePartnerSplit("2026-08", 500_000, true)).toEqual([]);
  });

  it("creates nothing when there is no positive net to split", () => {
    expect(assemblePartnerSplit("2026-08", 0, false)).toEqual([]);
    expect(assemblePartnerSplit("2026-08", -250_000, false)).toEqual([]);
  });
});
