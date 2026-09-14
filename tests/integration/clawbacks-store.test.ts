/**
 * @vitest-environment node
 *
 * Refund links and clawback waivers against a real Postgres: every link rule is
 * checked on database facts (never form input), two refunds can't together
 * over-refund a charge, a refund is never silently re-linked, a waiver needs a
 * real clawback to waive, and unlinking removes the waivers that depended on
 * the link.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  linkRefund,
  listClawbackWaivers,
  listRefundLinks,
  unlinkRefund,
  unwaiveClawback,
  waiveClawback,
} from "@/lib/payments/clawbacks-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("clawbacks store", () => {
  let sql: postgres.Sql;
  let clientId: string;
  let otherClientId: string;
  let integrationId: string;
  let otherIntegrationId: string;
  let repId: string;

  beforeAll(async () => {
    await runMigrations(databaseUrl);
    sql = postgres(databaseUrl!, { max: 1, prepare: false });
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [{ id: clientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Claw A', ${"claw-a-" + tag}) returning id`;
    [{ id: otherClientId }] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values ('Claw B', ${"claw-b-" + tag}) returning id`;
    [{ id: integrationId }] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('stripe', 'claw a', ${clientId}, 'connected') returning id`;
    [{ id: otherIntegrationId }] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values ('stripe', 'claw b', ${otherClientId}, 'connected') returning id`;
    [{ id: repId }] = await sql<{ id: string }[]>`
      insert into app.reps (client_id, name, role) values (${clientId}, 'Closer', 'closer')
      returning id`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await closeDb();
  });

  async function event(
    kind: string,
    amountCents: number,
    day: number,
    integration = integrationId,
    client = clientId,
  ) {
    const [row] = await sql<{ id: string }[]>`
      insert into app.payment_events (integration_id, provider, external_id, client_id, kind, amount_cents, occurred_at)
      values (${integration}, 'stripe', ${crypto.randomUUID()}, ${client}, ${kind}, ${amountCents},
        ${new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`)})
      returning id`;
    return row.id as string;
  }

  it("links a refund to its charge, refusing a second link for the same refund", async () => {
    const charge = await event("charge", 100_000, 1);
    const refund = await event("refund", -30_000, 3);
    expect(await linkRefund(refund, charge, "admin@example.com")).toEqual({ ok: true });
    expect(await linkRefund(refund, charge, null)).toEqual({
      ok: false,
      reason: "This refund is already linked. Unlink it first.",
    });
    expect(await listRefundLinks()).toContainEqual({
      refundEventId: refund,
      chargeEventId: charge,
    });
  });

  it("refuses links that break the rules, on the stored facts", async () => {
    const charge = await event("charge", 50_000, 5);
    const refund = await event("refund", -10_000, 6);
    const early = await event("refund", -10_000, 2);
    const foreign = await event("charge", 50_000, 1, otherIntegrationId, otherClientId);
    const twoRefunds = await event("refund", -1_000, 7);

    expect(await linkRefund(refund, foreign, null)).toMatchObject({
      reason: "The refund and the charge belong to different offers.",
    });
    expect(await linkRefund(early, charge, null)).toMatchObject({
      reason: "That charge happened after this refund.",
    });
    expect(await linkRefund(refund, twoRefunds, null)).toMatchObject({
      reason: "A refund can only be linked to a charge.",
    });
    const anotherCharge = await event("charge", 5_000, 8);
    expect(await linkRefund(anotherCharge, charge, null)).toMatchObject({
      reason: "Only a refund can claw back commission.",
    });
    expect(await linkRefund(refund, crypto.randomUUID(), null)).toEqual({
      ok: false,
      reason: "That payment no longer exists.",
    });
  });

  it("never lets refunds on one charge add up to more than it took", async () => {
    const charge = await event("charge", 50_000, 10);
    const first = await event("refund", -30_000, 11);
    const second = await event("refund", -20_001, 12);
    const exact = await event("refund", -20_000, 13);
    expect(await linkRefund(first, charge, null)).toEqual({ ok: true });
    expect(await linkRefund(second, charge, null)).toMatchObject({ ok: false });
    expect(await linkRefund(exact, charge, null)).toEqual({ ok: true });
  });

  it("waives only a real clawback, and unlinking removes its waivers", async () => {
    const charge = await event("charge", 100_000, 15);
    const refund = await event("refund", -100_000, 16);

    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "closer",
        reason: "goodwill",
        waivedBy: null,
      }),
    ).toEqual({ ok: false, reason: "Link the refund to its charge first." });

    await linkRefund(refund, charge, null);
    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "closer",
        reason: "goodwill",
        waivedBy: null,
      }),
    ).toEqual({ ok: false, reason: "Nobody claimed that seat on the charge." });

    await sql`
      insert into app.payment_assignments (payment_event_id, client_id, role, rep_id)
      values (${charge}, ${clientId}, 'closer', ${repId})`;
    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "closer",
        reason: " no ",
        waivedBy: null,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "boss",
        reason: "goodwill",
        waivedBy: null,
      }),
    ).toEqual({ ok: false, reason: "Unknown seat." });
    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "closer",
        reason: "goodwill",
        waivedBy: "a@x.com",
      }),
    ).toEqual({ ok: true });
    expect(
      await waiveClawback({
        refundEventId: refund,
        role: "closer",
        reason: "product defect",
        waivedBy: "a@x.com",
      }),
    ).toEqual({ ok: true });
    expect(
      (await listClawbackWaivers()).filter((w) => w.refundEventId === refund),
    ).toEqual([{ refundEventId: refund, role: "closer", reason: "product defect" }]);

    expect(await unwaiveClawback(refund, "closer")).toEqual({ ok: true });
    expect(await unwaiveClawback(refund, "closer")).toEqual({
      ok: false,
      reason: "No waiver to remove.",
    });

    await waiveClawback({
      refundEventId: refund,
      role: "closer",
      reason: "goodwill",
      waivedBy: null,
    });
    expect(await unlinkRefund(refund)).toEqual({ ok: true });
    expect((await listClawbackWaivers()).some((w) => w.refundEventId === refund)).toBe(
      false,
    );
    expect(await unlinkRefund(refund)).toEqual({
      ok: false,
      reason: "This refund isn't linked.",
    });
  });

  it("the database refuses a self-link and a bad waiver even without the store", async () => {
    const charge = await event("charge", 10_000, 20);
    await expect(sql`
      insert into app.payment_refund_links (refund_event_id, charge_event_id, client_id)
      values (${charge}, ${charge}, ${clientId})`).rejects.toThrow(/distinct_check/);
    await expect(sql`
      insert into app.payment_clawback_waivers (refund_event_id, role, reason)
      values (${charge}, 'boss', 'goodwill')`).rejects.toThrow(/role_check/);
    await expect(sql`
      insert into app.payment_clawback_waivers (refund_event_id, role, reason)
      values (${charge}, 'closer', '  ')`).rejects.toThrow(/reason_check/);
  });
});
