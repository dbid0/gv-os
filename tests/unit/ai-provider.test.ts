import { describe, expect, it } from "vitest";

import { NO_MODEL_MESSAGE, StubProvider, getAiProvider } from "@/lib/ai/provider";

describe("ai provider (stubbed for Phase 1)", () => {
  it("getAiProvider returns the locked stub", () => {
    const provider = getAiProvider();
    expect(provider.id).toBe("stub");
    expect(provider.unlocked).toBe(false);
  });

  it("the stub never completes and returns the honest go-live state", async () => {
    const provider = new StubProvider();
    const result = await provider.complete({
      face: "Operator",
      system: "You are Operator.",
      messages: [{ role: "user", content: "forecast Q4" }],
    });
    expect(result.ok).toBe(false);
    expect(result.unlocked).toBe(false);
    expect(result.provider).toBe("stub");
    expect(result.text).toBe(NO_MODEL_MESSAGE);
    // It names the real reason, not a launch date nobody is waiting on.
    expect(NO_MODEL_MESSAGE).not.toContain("go-live");
    expect(NO_MODEL_MESSAGE).toContain("starter question");
  });
});
