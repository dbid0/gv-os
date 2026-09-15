/**
 * @vitest-environment node
 *
 * 1-on-1 student calls against a real Postgres: a submission key logs once,
 * void/restore move a call in and out of the count, reads are scoped by
 * offer, and the CHECKs refuse rows the board could not attribute.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  activeStudentCallEmails,
  callLimitFor,
  listStudentCalls,
  logStudentCall,
  setStudentCallVoided,
} from "@/lib/students/calls-store";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)("student calls store", () => {
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
    const slug = `calls-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"Calls " + label}, ${slug})
      returning id`;
    return client.id as string;
  }

  const call = (email: string, day: string) => ({
    studentEmail: email,
    heldAt: new Date(`${day}T17:00:00Z`),
    coach: "Coach",
    notes: null,
  });

  it("logs once per submission key, counts active calls, and voids/restores", async () => {
    const clientId = await makeClient("log");
    const other = await makeClient("log-other");
    const key = crypto.randomUUID();
    const first = await logStudentCall({
      clientId,
      call: call("a@example.com", "2026-09-01"),
      submissionKey: key,
      by: null,
    });
    const again = await logStudentCall({
      clientId,
      call: call("a@example.com", "2026-09-01"),
      submissionKey: key,
      by: null,
    });
    expect(first.replayed).toBe(false);
    expect(again).toEqual({ id: first.id, replayed: true });
    const second = await logStudentCall({
      clientId,
      call: call("a@example.com", "2026-09-08"),
      submissionKey: crypto.randomUUID(),
      by: "coach@example.com",
    });
    await logStudentCall({
      clientId: other,
      call: call("a@example.com", "2026-09-08"),
      submissionKey: crypto.randomUUID(),
      by: null,
    });

    expect(await activeStudentCallEmails(clientId)).toHaveLength(2);
    expect(
      (await listStudentCalls(clientId, { voided: false })).map((c) => c.id),
    ).toEqual([second.id, first.id]);

    expect(await setStudentCallVoided(other, second.id, true, null)).toBe(false);
    expect(await setStudentCallVoided(clientId, second.id, true, "m@example.com")).toBe(
      true,
    );
    expect(await setStudentCallVoided(clientId, second.id, true, null)).toBe(false);
    expect(await activeStudentCallEmails(clientId)).toHaveLength(1);
    expect(await listStudentCalls(clientId, { voided: true })).toHaveLength(1);
    expect(await setStudentCallVoided(clientId, second.id, false, null)).toBe(true);
    expect(await setStudentCallVoided(clientId, second.id, false, null)).toBe(false);
    expect(await activeStudentCallEmails(clientId)).toHaveLength(2);
  });

  it("reads the offer's call limit and refuses unattributable rows", async () => {
    const clientId = await makeClient("limit");
    expect(await callLimitFor(clientId)).toBeNull();
    await sql`insert into app.offer_settings (client_id, one_on_one_call_limit) values (${clientId}, 4)`;
    expect(await callLimitFor(clientId)).toBe(4);
    await expect(
      sql`update app.offer_settings set one_on_one_call_limit = 0 where client_id = ${clientId}`,
    ).rejects.toThrow(/call_limit_check/);

    const insert = (email: string) => sql`
      insert into app.student_calls (client_id, student_email, held_at, submission_key)
      values (${clientId}, ${email}, now(), ${crypto.randomUUID()})`;
    await expect(insert("Upper@example.com")).rejects.toThrow(
      /student_calls_email_check/,
    );
    await expect(insert("no-at")).rejects.toThrow(/student_calls_email_check/);
  });
});
