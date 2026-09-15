/**
 * @vitest-environment node
 *
 * Call outcome rules against a real Postgres: filing a report tags the lead
 * and notifies once, a voided report takes back only its own tags, a restore
 * puts them back without a second notification, and the CHECKs refuse a rule
 * that could never do anything.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import type { CleanEoc } from "@/lib/calls/eoc-form";
import { fileEoc, restoreEoc, voidEoc } from "@/lib/calls/eoc-store";
import {
  applyOutcomeRules,
  createOutcomeRule,
  deleteOutcomeRule,
  listOutcomeRules,
  unapplyOutcomeRules,
} from "@/lib/calls/outcome-rules-store";
import { addLeadTag, listLeadTags } from "@/lib/tracking/lead-tags-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

const noShow: CleanEoc = {
  leadEmail: "Lead@Example.com",
  paymentEmail: null,
  outcome: "no_show",
  closeType: null,
  cashCollectedCents: null,
  contractValueCents: null,
  closerRepId: null,
  setterRepId: null,
  recordingUrl: null,
  notes: null,
};

describe.skipIf(!databaseUrl)("call outcome rules store", () => {
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
    const slug = `rules-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Rules " + label}, ${slug})
      returning id`;
    return client.id as string;
  }

  const file = (clientId: string, eoc: CleanEoc = noShow) =>
    fileEoc({
      clientId,
      bookingId: null,
      eoc,
      callAt: new Date(),
      submissionKey: crypto.randomUUID(),
      submittedBy: null,
    }).then((r) => (r as { id: string }).id);

  const notificationsFor = (reportId: string) =>
    sql`select id from app.notifications where dedupe_key = ${"call-outcome:" + reportId}`;

  it("manages rules, refusing a duplicate outcome + tag", async () => {
    const clientId = await makeClient("crud");
    const rule = { outcome: "no_show" as const, tag: "rebook", notify: true };
    expect(await createOutcomeRule(clientId, rule, null)).toEqual({ ok: true });
    expect(await createOutcomeRule(clientId, { ...rule, notify: false }, null)).toEqual(
      {
        ok: false,
        reason: "duplicate",
      },
    );
    const notifyOnly = { outcome: "no_show" as const, tag: null, notify: true };
    expect(await createOutcomeRule(clientId, notifyOnly, null)).toEqual({ ok: true });
    expect(await createOutcomeRule(clientId, notifyOnly, null)).toEqual({
      ok: false,
      reason: "duplicate",
    });
    const rules = await listOutcomeRules(clientId);
    expect(rules.map((r) => [r.outcome, r.tag, r.notify])).toEqual([
      ["no_show", "rebook", true],
      ["no_show", null, true],
    ]);
    expect(await deleteOutcomeRule(await makeClient("crud-other"), rules[0].id)).toBe(
      false,
    );
    expect(await deleteOutcomeRule(clientId, rules[0].id)).toBe(true);
    await expect(sql`
      insert into app.call_outcome_rules (client_id, outcome, notify) values (${clientId}, 'closed', false)`).rejects.toThrow(
      /does_something_check/,
    );
    await expect(sql`
      insert into app.call_outcome_rules (client_id, outcome, tag) values (${clientId}, 'ghosted', 'x')`).rejects.toThrow(
      /outcome_check/,
    );
  });

  it("tags and notifies on file; void takes back only its tags; restore re-applies once", async () => {
    const clientId = await makeClient("apply");
    await createOutcomeRule(
      clientId,
      { outcome: "no_show", tag: "rebook", notify: true },
      null,
    );
    await createOutcomeRule(
      clientId,
      { outcome: "no_show", tag: "cold", notify: false },
      null,
    );
    await createOutcomeRule(
      clientId,
      { outcome: "closed", tag: "student", notify: false },
      null,
    );
    // Someone already tagged this lead "cold" by hand.
    await addLeadTag(clientId, "lead@example.com", "cold", "rep@example.com");

    const reportId = await file(clientId);
    expect(await applyOutcomeRules(clientId, reportId)).toEqual({
      tags: ["cold", "rebook"],
      notified: true,
    });
    // Running again changes nothing and doesn't notify twice.
    expect(await applyOutcomeRules(clientId, reportId)).toEqual({
      tags: ["cold", "rebook"],
      notified: false,
    });
    expect(await notificationsFor(reportId)).toHaveLength(1);
    const tagged = async () =>
      (await listLeadTags(clientId)).map((t) => `${t.leadEmail}:${t.tag}`).sort();
    expect(await tagged()).toEqual([
      "lead@example.com:cold",
      "lead@example.com:rebook",
    ]);

    // Void: the rule's tag comes off, the hand-added one stays.
    await voidEoc(clientId, reportId, null);
    expect(await unapplyOutcomeRules(clientId, reportId)).toBe(1);
    expect(await tagged()).toEqual(["lead@example.com:cold"]);
    // A voided report sets nothing off.
    expect(await applyOutcomeRules(clientId, reportId)).toEqual({
      tags: [],
      notified: false,
    });

    // Restore: tags back, no second notification.
    expect((await restoreEoc(clientId, reportId)).ok).toBe(true);
    expect(await applyOutcomeRules(clientId, reportId)).toEqual({
      tags: ["cold", "rebook"],
      notified: false,
    });
    expect(await tagged()).toEqual([
      "lead@example.com:cold",
      "lead@example.com:rebook",
    ]);
    expect(await notificationsFor(reportId)).toHaveLength(1);

    // Two no-shows for the same lead: voiding one keeps the tag the other
    // still calls for.
    const secondId = await file(clientId);
    await applyOutcomeRules(clientId, secondId);
    await voidEoc(clientId, reportId, null);
    expect(await unapplyOutcomeRules(clientId, reportId)).toBe(0);
    expect(await tagged()).toEqual([
      "lead@example.com:cold",
      "lead@example.com:rebook",
    ]);
    await voidEoc(clientId, secondId, null);
    expect(await unapplyOutcomeRules(clientId, secondId)).toBe(1);
    expect(await tagged()).toEqual(["lead@example.com:cold"]);
    expect(await unapplyOutcomeRules(clientId, crypto.randomUUID())).toBe(0);

    // An outcome with no notify rule tags without notifying; another offer's
    // rules never fire.
    const closedId = await file(clientId, {
      ...noShow,
      leadEmail: "buyer@example.com",
      outcome: "closed",
      closeType: "pif",
      cashCollectedCents: 100_000,
      contractValueCents: 100_000,
    });
    expect(await applyOutcomeRules(clientId, closedId)).toEqual({
      tags: ["student"],
      notified: false,
    });
    expect(await applyOutcomeRules(await makeClient("apply-other"), closedId)).toEqual({
      tags: [],
      notified: false,
    });
  });
});
