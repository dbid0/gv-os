/**
 * @vitest-environment node
 *
 * Payment tag rules against a real Postgres: the table's CHECK constraints
 * refuse rows the classifier could not read, the store round-trips a rule in
 * evaluation order, and every write is scoped by client — a rule id from one
 * offer can never edit, toggle or delete another offer's rule.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import type { CleanTagRule } from "@/lib/tracking/tag-rules";
import {
  createTagRule,
  deleteTagRule,
  listTagRules,
  setTagRuleActive,
  updateTagRule,
} from "@/lib/tracking/tag-rules-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

const baseRule: CleanTagRule = {
  tag: "test-charge",
  matchField: "label",
  matchOp: "contains",
  matchValue: "test",
  countsAsRevenue: true,
  countsAsOptin: false,
  exclude: true,
  excludeFromAov: false,
  hideFromDashboard: false,
  sortOrder: 100,
  active: true,
};

describe.skipIf(!databaseUrl)("payment tag rules store", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function makeClient(label: string) {
    const slug = `tag-rules-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Tag Rules " + label}, ${slug})
      returning id`;
    return client.id as string;
  }

  it("round-trips rules in sort order", async () => {
    const clientId = await makeClient("order");
    await createTagRule(clientId, { ...baseRule, tag: "second", sortOrder: 200 }, null);
    await createTagRule(
      clientId,
      { ...baseRule, tag: "first", sortOrder: 10 },
      "admin@example.com",
    );
    const rules = await listTagRules(clientId);
    expect(rules.map((r) => r.tag)).toEqual(["first", "second"]);
    expect(rules[0]).toMatchObject({
      matchField: "label",
      matchOp: "contains",
      exclude: true,
      countsAsRevenue: true,
      active: true,
    });
  });

  it("scopes every write to its own client", async () => {
    const mine = await makeClient("mine");
    const theirs = await makeClient("theirs");
    const id = await createTagRule(mine, baseRule, null);

    expect(await updateTagRule(theirs, id, { ...baseRule, tag: "hijack" })).toBe(false);
    expect(await setTagRuleActive(theirs, id, false)).toBe(false);
    expect(await deleteTagRule(theirs, id)).toBe(false);
    expect((await listTagRules(mine)).map((r) => [r.tag, r.active])).toEqual([
      ["test-charge", true],
    ]);

    expect(await updateTagRule(mine, id, { ...baseRule, tag: "renamed" })).toBe(true);
    expect(await setTagRuleActive(mine, id, false)).toBe(true);
    expect((await listTagRules(mine))[0]).toMatchObject({
      tag: "renamed",
      active: false,
    });
    expect(await deleteTagRule(mine, id)).toBe(true);
    expect(await listTagRules(mine)).toEqual([]);
  });

  it("refuses rows the classifier could not read", async () => {
    const clientId = await makeClient("checks");
    const insert = (field: string, op: string, tag = "t") => sql`
      insert into app.payment_tag_rules (client_id, tag, match_field, match_op, match_value)
      values (${clientId}, ${tag}, ${field}, ${op}, ${"1"})`;

    await expect(insert("rep", "equals")).rejects.toThrow(
      /payment_tag_rules_field_check/,
    );
    await expect(insert("label", "regex")).rejects.toThrow(
      /payment_tag_rules_op_check/,
    );
    await expect(insert("amount_cents", "contains")).rejects.toThrow(
      /payment_tag_rules_op_fits_field_check/,
    );
    await expect(insert("label", "amount_gte")).rejects.toThrow(
      /payment_tag_rules_op_fits_field_check/,
    );
    await expect(insert("label", "equals", "   ")).rejects.toThrow(
      /payment_tag_rules_tag_check/,
    );
    await expect(insert("amount_cents", "amount_eq")).resolves.toBeDefined();
  });

  it("disappears with its client", async () => {
    const clientId = await makeClient("cascade");
    await createTagRule(clientId, baseRule, null);
    await sql`delete from app.clients where id = ${clientId}`;
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from app.payment_tag_rules where client_id = ${clientId}`;
    expect(count).toBe(0);
  });
});
