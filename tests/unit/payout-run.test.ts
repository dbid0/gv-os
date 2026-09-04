import { describe, expect, it } from "vitest";

import { agencyLedger, type LedgerInputRow } from "@/lib/transactions/ledger";
import { payoutDealType, payoutDirection } from "@/lib/payouts/math";
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

describe("partner distributions draw down the net they came from", () => {
  const row = (over: Partial<LedgerInputRow>): LedgerInputRow => ({
    direction: "in",
    layer: "agency",
    dealType: null,
    paymentMethod: null,
    revenueCents: 0,
    cashCents: 0,
    processorFeeCents: 0,
    ...over,
  });

  /**
   * The property that makes the monthly run safe.
   *
   * The generator splits the agency's ALL-TIME net, not the month's, which is
   * only correct because a distribution that has been paid writes a backlog
   * row that reduces that net. Without this, generating a run in October would
   * draft Daniel and Gus the entire history again — every month, forever.
   *
   * It holds through three separate pieces: payoutDealType names the row,
   * payoutDirection makes it outbound, and agencyLedger counts it. Changing
   * any one of them silently breaks partner money, so the chain is asserted
   * here end to end rather than in three places that each look fine alone.
   */
  it("a PAID distribution leaves nothing for the next run to draft twice", () => {
    const collected = [row({ direction: "in", cashCents: 100_000 })];

    const first = agencyLedger(collected).chain.netCents;
    expect(first).toBe(100_000);
    const drafts = assemblePartnerSplit("2026-09", first, false);
    expect(drafts[0].baseCents + drafts[1].baseCents).toBe(100_000);

    // Marking both paid appends what the real action appends.
    const afterPaying = [
      ...collected,
      ...drafts.map((d) =>
        row({
          direction: payoutDirection("partner"),
          dealType: payoutDealType("partner"),
          cashCents: d.baseCents,
        }),
      ),
    ];

    const remaining = agencyLedger(afterPaying).chain.netCents;
    expect(remaining).toBe(0);
    // Next month has nothing left to distribute.
    expect(assemblePartnerSplit("2026-10", remaining, false)).toEqual([]);
  });

  it("a partner distribution is NOT counted as a team payout", () => {
    // Team is rep share and retainers — people who work the offers. Folding
    // partner money in there would misstate what the floor costs to run.
    const chain = agencyLedger([
      row({ direction: "in", cashCents: 10_000 }),
      row({ direction: "out", dealType: payoutDealType("partner"), cashCents: 4_000 }),
    ]).chain;
    expect(chain.teamCents).toBe(0);
    expect(chain.otherOutCents).toBe(4_000);
    expect(chain.netCents).toBe(6_000);
  });

  it("only the undistributed remainder is offered next time", () => {
    const rows = [
      row({ direction: "in", cashCents: 100_000 }),
      row({ direction: "out", dealType: payoutDealType("partner"), cashCents: 30_000 }),
    ];
    const net = agencyLedger(rows).chain.netCents;
    expect(net).toBe(70_000);
    const drafts = assemblePartnerSplit("2026-10", net, false);
    expect(drafts[0].baseCents + drafts[1].baseCents).toBe(70_000);
  });
});
