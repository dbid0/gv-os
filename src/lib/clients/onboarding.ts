/**
 * The setup checklist for a signed offer — what it takes to fully stand a client
 * up in GV OS. Pure: it turns a handful of facts about the offer into an ordered
 * list of steps with done/pending state and a completion figure, so the setup
 * page and any progress badge read the same source. No data access here.
 */

export interface OnboardingInput {
  /** A rev-share rule row exists for this client (rate is locked). */
  hasRevShareRule: boolean;
  /** Active reps on the team. */
  repCount: number;
  /** EOD templates defined for the team. */
  templateCount: number;
  /** Connected (non-revoked) integrations scoped to this offer. */
  connectedFeedCount: number;
  /** The new-deal-forms tracking sheet is set. */
  hasTrackingSheet: boolean;
  /** A per-offer settings row exists (alert times / goals configured). */
  hasOfferSettings: boolean;
}

export interface OnboardingStep {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  /** Where to go to complete it (a route or an in-page anchor). */
  href: string;
}

export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  return [
    {
      key: "reps",
      label: "Add the sales team",
      detail: input.repCount
        ? `${input.repCount} ${input.repCount === 1 ? "rep" : "reps"} on the roster`
        : "No reps yet — add closers and setters",
      done: input.repCount > 0,
      href: "/team",
    },
    {
      key: "templates",
      label: "Generate EOD templates",
      detail: input.templateCount
        ? `${input.templateCount} ${input.templateCount === 1 ? "template" : "templates"} defined`
        : "No templates — reps have nowhere to file their EOD",
      done: input.templateCount > 0,
      href: "/sales/templates",
    },
    {
      key: "feeds",
      label: "Connect the data feeds",
      detail: input.connectedFeedCount
        ? `${input.connectedFeedCount} connected`
        : "Connect the payment processor, CRM, and email",
      done: input.connectedFeedCount > 0,
      href: "#data-feeds",
    },
    {
      key: "tracking_sheet",
      label: "Link the new-deal-forms sheet",
      detail: input.hasTrackingSheet
        ? "Sheet linked — deals validate against cash"
        : "Not linked — the sheet that drives commissions",
      done: input.hasTrackingSheet,
      href: "#data-feeds",
    },
    {
      key: "revshare",
      label: "Lock the rev-share rule",
      detail: input.hasRevShareRule
        ? "Rate locked"
        : "No rule — set the rev-share rate for this offer",
      done: input.hasRevShareRule,
      href: "/accounting/revshare",
    },
    {
      key: "settings",
      label: "Set per-offer alerts & goals",
      detail: input.hasOfferSettings
        ? "Configured"
        : "Default alert times — set BOD/EOD times and the monthly goal",
      done: input.hasOfferSettings,
      href: "/settings",
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  pct: number;
  complete: boolean;
} {
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: done === total,
  };
}
