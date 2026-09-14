import "server-only";

import { cashRowsForClient, latestSnapshotsBySource } from "@/lib/tracking/queries";
import {
  applyTagRulesToFeed,
  describeRule,
  previewRule,
  type FeedTagSummary,
  type RuleablePayment,
} from "@/lib/tracking/tag-rules";
import { listTagRules, type StoredTagRule } from "@/lib/tracking/tag-rules-store";
import { topValues, type ValueCount } from "@/lib/tracking/tag-rules-panel-values";

export type { ValueCount };

export type TagRulePanelRow = StoredTagRule & {
  condition: string;
  /** What this rule matches on its own in the current feed. */
  matches: { count: number; cashCents: number };
};

export type TagRulesPanelData = {
  rules: TagRulePanelRow[];
  /** Which feed the preview ran against, or null when the offer has none. */
  feedSource: "stripe" | "sheet" | null;
  feedPaymentCount: number;
  /** The combined effect of every active rule on the dashboard feed. */
  summary: FeedTagSummary;
  /** The feed's most common values, so a rule is written against real words. */
  common: { labels: ValueCount[]; providers: ValueCount[]; kinds: ValueCount[] };
};

/**
 * Everything the setup page's tag-rules section shows, read from the same feed
 * the dashboard counts (processor snapshot first, the sheet as fallback) so the
 * preview can never describe a different set of payments than the one the rules
 * will actually apply to.
 */
export async function loadTagRulesPanel(clientId: string): Promise<TagRulesPanelData> {
  const [rules, snaps] = await Promise.all([
    listTagRules(clientId),
    latestSnapshotsBySource(clientId),
  ]);
  const paySource =
    snaps.find((x) => x.source === "stripe") ??
    snaps.find((x) => x.source === "sheet") ??
    null;

  let payments: RuleablePayment[] = [];
  if (paySource) {
    payments = (await cashRowsForClient(paySource.snapshot.syncId)).payments;
  }

  return {
    rules: rules.map((r) => ({
      ...r,
      condition: describeRule(r),
      matches: previewRule(r, payments),
    })),
    feedSource: paySource ? (paySource.source === "stripe" ? "stripe" : "sheet") : null,
    feedPaymentCount: payments.length,
    summary: applyTagRulesToFeed(payments, rules).summary,
    common: {
      labels: topValues(payments.map((p) => p.label)),
      providers: topValues(payments.map((p) => p.provider)),
      kinds: topValues(payments.map((p) => p.kind)),
    },
  };
}
