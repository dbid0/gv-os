import { describe, expect, it } from "vitest";

import {
  onboardingProgress,
  onboardingSteps,
  type OnboardingInput,
} from "@/lib/clients/onboarding";

const base: OnboardingInput = {
  hasRevShareRule: false,
  repCount: 0,
  templateCount: 0,
  connectedFeedCount: 0,
  hasTrackingSheet: false,
  hasOfferSettings: false,
};

describe("onboardingSteps", () => {
  it("marks nothing done for a brand-new offer", () => {
    const steps = onboardingSteps(base);
    expect(steps).toHaveLength(6);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(onboardingProgress(steps)).toEqual({
      done: 0,
      total: 6,
      pct: 0,
      complete: false,
    });
  });

  it("flips a step done when its fact is satisfied", () => {
    const steps = onboardingSteps({ ...base, repCount: 3, templateCount: 2 });
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.reps.done).toBe(true);
    expect(byKey.reps.detail).toContain("3 reps");
    expect(byKey.templates.done).toBe(true);
    expect(byKey.feeds.done).toBe(false);
  });

  it("reports full completion when every fact is set", () => {
    const steps = onboardingSteps({
      hasRevShareRule: true,
      repCount: 4,
      templateCount: 4,
      connectedFeedCount: 3,
      hasTrackingSheet: true,
      hasOfferSettings: true,
    });
    const p = onboardingProgress(steps);
    expect(p.complete).toBe(true);
    expect(p.pct).toBe(100);
    expect(p.done).toBe(6);
  });

  it("computes a partial percentage", () => {
    const steps = onboardingSteps({
      ...base,
      repCount: 1,
      templateCount: 1,
      hasTrackingSheet: true,
    });
    expect(onboardingProgress(steps).pct).toBe(50); // 3 of 6
  });
});
