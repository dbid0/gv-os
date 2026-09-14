import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentTagRules } from "@/db/schema/app";
import type {
  CleanTagRule,
  TagRule,
  TagRuleField,
  TagRuleOp,
} from "@/lib/tracking/tag-rules";

/** A stored rule in the classifier's shape (plus when it was last touched). */
export type StoredTagRule = TagRule & { updatedAt: Date };

/**
 * One offer's rules, in evaluation order. Fail-soft callers wrap this: a
 * rules read that throws must never take a dashboard down, and an empty list
 * is exactly the no-rules behaviour.
 */
export async function listTagRules(clientId: string): Promise<StoredTagRule[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paymentTagRules)
    .where(eq(paymentTagRules.clientId, clientId))
    .orderBy(asc(paymentTagRules.sortOrder), asc(paymentTagRules.createdAt));
  return rows.map((r) => ({
    id: r.id,
    tag: r.tag,
    matchField: r.matchField as TagRuleField,
    matchOp: r.matchOp as TagRuleOp,
    matchValue: r.matchValue,
    countsAsRevenue: r.countsAsRevenue,
    countsAsOptin: r.countsAsOptin,
    exclude: r.exclude,
    excludeFromAov: r.excludeFromAov,
    hideFromDashboard: r.hideFromDashboard,
    sortOrder: r.sortOrder,
    active: r.active,
    updatedAt: r.updatedAt,
  }));
}

/** Insert a validated rule. Returns its id. */
export async function createTagRule(
  clientId: string,
  rule: CleanTagRule,
  createdBy: string | null,
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(paymentTagRules)
    .values({ clientId, ...rule, createdBy })
    .returning({ id: paymentTagRules.id });
  return row.id;
}

/**
 * Replace a rule's definition. Scoped by client as well as id, so a rule id
 * from one offer can never edit another offer's rule. Returns whether a row
 * was updated.
 */
export async function updateTagRule(
  clientId: string,
  ruleId: string,
  rule: CleanTagRule,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(paymentTagRules)
    .set({ ...rule, updatedAt: new Date() })
    .where(and(eq(paymentTagRules.id, ruleId), eq(paymentTagRules.clientId, clientId)))
    .returning({ id: paymentTagRules.id });
  return rows.length > 0;
}

/** Turn a rule on or off without losing its definition. */
export async function setTagRuleActive(
  clientId: string,
  ruleId: string,
  active: boolean,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(paymentTagRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(paymentTagRules.id, ruleId), eq(paymentTagRules.clientId, clientId)))
    .returning({ id: paymentTagRules.id });
  return rows.length > 0;
}

/** Delete a rule. The payments it matched return to the figures unchanged. */
export async function deleteTagRule(
  clientId: string,
  ruleId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(paymentTagRules)
    .where(and(eq(paymentTagRules.id, ruleId), eq(paymentTagRules.clientId, clientId)))
    .returning({ id: paymentTagRules.id });
  return rows.length > 0;
}
