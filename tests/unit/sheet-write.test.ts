import { describe, expect, it } from "vitest";

import { financeRawRow, type AgencyDealInput } from "@/lib/accounting/sheet-write";
import { parseRawRow } from "@/lib/accounting/sheet-mirror";

/**
 * The contract: a row we WRITE must parse back to the exact same deal the sheet
 * mirror READS. If a column moves or a unit changes, this fails — which is the
 * whole point ("make sure the fields to rows are the exact same so nothing
 * breaks").
 */
describe("financeRawRow round-trips through parseRawRow", () => {
  const TS = "2026-08-27 14:03:00";

  function roundTrip(input: AgencyDealInput) {
    const row = financeRawRow(input, TS);
    const parsed = parseRawRow(row, 42);
    if (!parsed) throw new Error("row parsed to null");
    return parsed;
  }

  it("preserves every field, exactly", () => {
    const input: AgencyDealInput = {
      dateClosed: "2026-08-27",
      client: "The Vault",
      dealType: "Client Handoff",
      offer: "The Vault",
      revenueCents: 500000,
      cashCents: 250000,
      method: "Fanbasis",
      pctEntered: 45,
      feeOverrideCents: 1234,
      agreement: "Signed",
      notes: "logged from GV OS",
      payoutStatus: "Pending",
    };
    const p = roundTrip(input);
    expect(p.timestamp).toBe(TS);
    expect(p.dateClosed).toBe("2026-08-27");
    expect(p.client).toBe("The Vault");
    expect(p.dealType).toBe("Client Handoff");
    expect(p.offer).toBe("The Vault");
    expect(p.revenueCents).toBe(500000);
    expect(p.cashCents).toBe(250000);
    expect(p.method).toBe("Fanbasis");
    expect(p.pctEntered).toBe(45);
    expect(p.feeOverrideCents).toBe(1234);
    expect(p.agreement).toBe("Signed");
    expect(p.notes).toBe("logged from GV OS");
    expect(p.payoutStatus).toBe("Pending");
  });

  it("blank percent + fee override read back as null (formula applies)", () => {
    const p = roundTrip({
      dateClosed: "2026-01-05",
      client: "The Grid",
      dealType: "Rev Share",
      offer: "The Grid",
      revenueCents: 199900,
      cashCents: 199900,
      method: "Stripe",
      pctEntered: null,
      feeOverrideCents: null,
      agreement: "",
      notes: "",
      payoutStatus: "",
    });
    expect(p.pctEntered).toBeNull();
    expect(p.feeOverrideCents).toBeNull();
    expect(p.revenueCents).toBe(199900);
    expect(p.cashCents).toBe(199900);
  });

  it("non-round-dollar cents survive the dollars<->cents conversion", () => {
    const p = roundTrip({
      dateClosed: "2026-03-15",
      client: "Racks Closes",
      dealType: "Rev Share",
      offer: "Racks",
      revenueCents: 512345, // $5,123.45
      cashCents: 99999, // $999.99
      method: "Whop",
      pctEntered: 30,
      feeOverrideCents: null,
      agreement: "",
      notes: "",
      payoutStatus: "",
    });
    expect(p.revenueCents).toBe(512345);
    expect(p.cashCents).toBe(99999);
  });
});
