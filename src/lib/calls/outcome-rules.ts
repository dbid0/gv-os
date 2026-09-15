/**
 * CALL OUTCOME RULES — what filing a call's outcome sets off.
 *
 * NenBase's status forms move the lead along when a rep files what happened.
 * GV OS's pipeline stage is read from the sheet, never hand-set, so a rule
 * here does the two things that stay honest:
 * - TAG the lead, so a saved Leads view ("Tagged no-show") becomes a live
 *   work queue without anyone remembering to label anyone;
 * - NOTIFY the team in-app ("Call filed as Closed: lead@…").
 *
 * - Rules fire for reports filed in GV OS only.
 * - Several rules for one outcome combine: every tag they name, and one
 *   notification per report no matter how many rules ask for it.
 * - The notification's key is the report, so restoring a voided report never
 *   notifies twice.
 *
 * Pure: no database.
 */

import { EOC_OUTCOMES, type EocOutcomeKey } from "@/lib/calls/eoc-form";
import type { Candidate } from "@/lib/notifications/rules";
import { normalizeTag } from "@/lib/tracking/lead-views";

export type OutcomeRuleInput = { outcome: string; tag: string; notify: boolean };

export type CleanOutcomeRule = {
  outcome: EocOutcomeKey;
  tag: string | null;
  notify: boolean;
};

export type OutcomeRule = CleanOutcomeRule & { id: string };

const outcomeLabel = (key: string) =>
  EOC_OUTCOMES.find((o) => o.key === key)?.label ?? key;

export function validateOutcomeRule(
  input: OutcomeRuleInput,
): { ok: true; rule: CleanOutcomeRule } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const outcome = EOC_OUTCOMES.find((o) => o.key === input.outcome)?.key;
  if (!outcome) errors.push("Pick the outcome this rule runs on.");

  let tag: string | null = null;
  if (input.tag.trim() !== "") {
    const t = normalizeTag(input.tag);
    if (t.ok) tag = t.tag;
    else errors.push(t.error);
  }
  if (tag === null && !input.notify && errors.length === 0) {
    errors.push("A rule needs a tag to add, a notification, or both.");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    rule: { outcome: outcome as EocOutcomeKey, tag, notify: input.notify },
  };
}

/** "Filed as No-show → tag no-show · notify the team". */
export function describeOutcomeRule(rule: CleanOutcomeRule): string {
  const does = [
    rule.tag ? `tag ${rule.tag}` : null,
    rule.notify ? "notify the team" : null,
  ].filter(Boolean);
  return `Filed as ${outcomeLabel(rule.outcome)} → ${does.join(" · ")}`;
}

/** What the rules do for one filed outcome. */
export function effectsFor(
  rules: CleanOutcomeRule[],
  outcome: string,
): { tags: string[]; notify: boolean } {
  const matching = rules.filter((r) => r.outcome === outcome);
  const tags = [
    ...new Set(matching.map((r) => r.tag).filter((t): t is string => t !== null)),
  ].sort();
  return { tags, notify: matching.some((r) => r.notify) };
}

export function outcomeNotification(report: {
  id: string;
  clientId: string;
  outcome: string;
  leadEmail: string;
  tags: string[];
}): Candidate {
  return {
    kind: "call_outcome",
    severity: "info",
    title: `Call filed as ${outcomeLabel(report.outcome)}: ${report.leadEmail}`,
    body: report.tags.length > 0 ? `Tagged ${report.tags.join(", ")}.` : null,
    clientId: report.clientId,
    dedupeKey: `call-outcome:${report.id}`,
  };
}
