import { describe, expect, it } from "vitest";

import { buildDigestMessage, type DigestStats } from "@/lib/discord/digest";
import { GV_BRAND_COLOR } from "@/lib/discord/embed";

const base: DigestStats = {
  monthLabel: "August 2026",
  monthCashCents: 8_900_00,
  topReps: [
    { name: "Zara Okafor", cashCents: 72_175_00, deals: 12 },
    { name: "Yusuf Petrov", cashCents: 74_220_00, deals: 12 },
  ],
  funnel: { setsBooked: 2752, shows: 465, deals: 83, closeRatePct: 18 },
  arOwedCents: 12_500_00,
  driftCount: 0,
  driftTotalCents: 0,
};

describe("buildDigestMessage", () => {
  it("leads with the month's cash and lists the funnel + top reps + AR", () => {
    const e = buildDigestMessage(base).embeds![0];
    expect(e.description).toBe("**$8,900** collected in August 2026");
    expect(e.color).toBe(GV_BRAND_COLOR);
    const funnel = e.fields!.find((f) => f.name === "Funnel")!;
    expect(funnel.value).toBe("2,752 sets → 465 shows → 83 deals (18% close)");
    const reps = e.fields!.find((f) => f.name === "Top reps")!;
    expect(reps.value).toContain("**Zara Okafor** — $72,175 (12)");
    expect(e.fields!.find((f) => f.name === "AR owed")!.value).toBe("$12,500");
  });

  it("turns red and adds a drift flag when the reconciler is off", () => {
    const e = buildDigestMessage({
      ...base,
      driftCount: 2,
      driftTotalCents: 45_000,
    }).embeds![0];
    expect(e.color).not.toBe(GV_BRAND_COLOR); // red
    const drift = e.fields!.find((f) => f.name === "⚠️ Reconciler drift")!;
    expect(drift.value).toContain("2 books off by $450");
  });

  it("has no drift field when everything reconciles", () => {
    const e = buildDigestMessage(base).embeds![0];
    expect(e.fields!.some((f) => f.name.includes("drift"))).toBe(false);
  });

  it("handles an empty funnel and no reps honestly", () => {
    const e = buildDigestMessage({
      ...base,
      topReps: [],
      funnel: { setsBooked: 0, shows: 0, deals: 0, closeRatePct: null },
    }).embeds![0];
    expect(e.fields!.find((f) => f.name === "Funnel")!.value).toContain("(— close)");
    expect(e.fields!.find((f) => f.name === "Top reps")!.value).toBe(
      "No rep activity yet",
    );
  });
});
