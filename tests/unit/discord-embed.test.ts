import { describe, expect, it } from "vitest";

import {
  GV_BRAND_COLOR,
  buildAgencySnapshotEmbed,
  buildAlertBatchMessage,
  buildTestMessage,
  usdWhole,
  type AlertNotification,
} from "@/lib/discord/embed";

describe("usdWhole", () => {
  it("groups whole dollars and drops the cents", () => {
    expect(usdWhole(123_456_78)).toBe("$123,457"); // rounds to nearest dollar
    expect(usdWhole(0)).toBe("$0");
    expect(usdWhole(99)).toBe("$1");
  });

  it("keeps a negative sign in front of the dollar sign", () => {
    expect(usdWhole(-500_00)).toBe("-$500");
  });
});

describe("buildAgencySnapshotEmbed", () => {
  const embed = buildAgencySnapshotEmbed({
    monthLabel: "August 2026",
    monthCashCents: 8_900_00,
    totalRevenueCents: 12_500_00,
    dealsClosed: 7,
    activeClients: 4,
    isoTimestamp: "2026-08-24T12:00:00.000Z",
  }).embeds![0];

  it("leads with the month's collected cash in the description", () => {
    expect(embed.description).toBe("**$8,900** collected in August 2026");
    expect(embed.color).toBe(GV_BRAND_COLOR);
  });

  it("carries revenue, deals, and clients as fields", () => {
    expect(embed.fields).toEqual([
      { name: "Revenue booked", value: "$12,500", inline: true },
      { name: "Deals closed", value: "7", inline: true },
      { name: "Active clients", value: "4", inline: true },
    ]);
  });

  it("passes the timestamp through and never invents one", () => {
    expect(embed.timestamp).toBe("2026-08-24T12:00:00.000Z");
    const noStamp = buildAgencySnapshotEmbed({
      monthLabel: "August 2026",
      monthCashCents: 0,
      totalRevenueCents: 0,
      dealsClosed: 0,
      activeClients: 0,
    }).embeds![0];
    expect(noStamp.timestamp).toBeUndefined();
  });
});

describe("buildTestMessage", () => {
  it("is a plain content line, no embed", () => {
    const msg = buildTestMessage();
    expect(msg.content).toContain("connected");
    expect(msg.embeds).toBeUndefined();
  });
});

describe("buildAlertBatchMessage", () => {
  const alert = (o: Partial<AlertNotification>): AlertNotification => ({
    severity: "warning",
    title: "Something needs a look",
    body: "The detail line.",
    clientName: "The Grid",
    ...o,
  });

  it("renders one embed per alert, colored and emoji'd by severity", () => {
    const msg = buildAlertBatchMessage([
      alert({ severity: "critical", title: "Failed charge" }),
      alert({ severity: "warning", title: "Late lead" }),
    ]);
    expect(msg.content).toBe("**2 new alerts — GV OS**");
    expect(msg.embeds).toHaveLength(2);
    expect(msg.embeds![0]).toMatchObject({
      title: "🔴 Failed charge",
      description: "The detail line.",
      color: 0xe5484d,
      footer: { text: "The Grid" },
    });
    expect(msg.embeds![1]).toMatchObject({ title: "🟠 Late lead", color: 0xf5a623 });
  });

  it("singular content line for exactly one alert", () => {
    const msg = buildAlertBatchMessage([alert({})]);
    expect(msg.content).toBe("**New alert — GV OS**");
  });

  it("falls back to 'GV OS' as the footer when there's no single client", () => {
    const msg = buildAlertBatchMessage([alert({ clientName: null })]);
    expect(msg.embeds![0].footer).toEqual({ text: "GV OS" });
  });

  it("caps at 10 embeds and folds the rest into one overflow line", () => {
    const alerts = Array.from({ length: 13 }, (_, i) => alert({ title: `Alert ${i}` }));
    const msg = buildAlertBatchMessage(alerts);
    expect(msg.embeds).toHaveLength(11);
    expect(msg.embeds![10]).toMatchObject({
      description: "+ 3 more — open /notifications in GV OS.",
      color: GV_BRAND_COLOR,
    });
  });
});
