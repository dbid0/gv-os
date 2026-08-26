import type { EodCalcField } from "@/db/schema/app";

/**
 * The standard EOD template for each sales role — the sensible default so that
 * as soon as a team has reps, their daily numbers have somewhere to land (no
 * one has to hand-build a form first). Every field key is drawn from the shared
 * BASE_EOD_FIELDS vocabulary, so the submit form, leaderboard, and dashboard
 * tiles all line up.
 *
 * Pure and data-only, so the generator action and its tests share one source.
 */

export interface DefaultTemplate {
  baseFields: string[];
  calcFields: EodCalcField[];
}

const pct = (
  key: string,
  label: string,
  numerator: string,
  denominator: string,
): EodCalcField => ({
  key,
  label,
  format: "percent",
  numerator,
  denominator,
  showOnDashboard: true,
});

export function defaultTemplateForRole(role: string): DefaultTemplate {
  switch (role) {
    case "closer":
      return {
        baseFields: [
          "calls_taken",
          "shows",
          "no_shows",
          "cancelled_calls",
          "follow_up_calls",
        ],
        calcFields: [pct("show_rate", "Show rate", "shows", "calls_taken")],
      };
    case "setter":
      return {
        baseFields: ["dials", "connects", "sets_booked", "follow_up_calls"],
        calcFields: [pct("set_rate", "Set rate", "sets_booked", "dials")],
      };
    case "dm_setter":
      return {
        baseFields: ["dms_sent", "connects", "sets_booked", "follow_up_calls"],
        calcFields: [pct("dm_set_rate", "Set rate", "sets_booked", "dms_sent")],
      };
    default:
      // manager / anything unmapped: a light oversight set, no derived metric.
      return {
        baseFields: ["calls_taken", "shows", "sets_booked"],
        calcFields: [],
      };
  }
}

/** The template name a generated default carries, e.g. "Closer — Daily EOD". */
export function defaultTemplateName(roleLabel: string): string {
  return `${roleLabel} — Daily EOD`;
}
