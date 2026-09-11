/**
 * @vitest-environment node
 *
 * `liveSpeedToLead`'s query shape, proved against a real Postgres rather than
 * assumed from the schema: the join from `applications` to `crm_activity` by
 * lead email, the connected-gate requiring BOTH Typeform and Close, and the
 * outbound-only filter across all three activity kinds (call, sms, email —
 * exercising both of Close's direction vocabularies, since a filter that only
 * recognized "outbound" would silently drop every outgoing email).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "@/db/migrate";
import { closeDb } from "@/db/client";
import { liveSpeedToLead } from "@/lib/crm/speed-to-lead-live";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "Integration tests require DATABASE_URL. CI must provide a Postgres service.",
  );
}

describe.skipIf(!databaseUrl)(
  "liveSpeedToLead",
  () => {
    let sql: postgres.Sql;

    beforeAll(async () => {
      await runMigrations(databaseUrl);
      sql = postgres(databaseUrl!, { max: 1, prepare: false });
    });

    afterAll(async () => {
      await sql?.end({ timeout: 5 });
      // liveSpeedToLead reads through the app's OWN pooled client (getDb()),
      // a separate connection from the raw `sql` handle above — both must
      // close or the test process hangs on an open socket.
      await closeDb();
    });

    async function makeClient(label: string) {
      const slug = `stl-live-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [client] = await sql<{ id: string }[]>`
      insert into app.clients (name, slug) values (${"STL Live " + label}, ${slug})
      returning id`;
      return client.id as string;
    }

    async function connectIntegration(
      clientId: string,
      provider: "close" | "typeform",
      status: "connected" | "error" = "connected",
    ) {
      const [row] = await sql<{ id: string }[]>`
      insert into app.integrations (provider, label, client_id, status)
      values (${provider}, ${provider + " test"}, ${clientId}, ${status})
      returning id`;
      return row.id as string;
    }

    async function insertApplication(
      integrationId: string,
      clientId: string,
      email: string,
      submittedAt: Date,
    ) {
      await sql`
      insert into app.applications
        (integration_id, provider, external_id, client_id, email, name, submitted_at)
      values
        (${integrationId}, 'typeform', ${"app-" + email + "-" + submittedAt.getTime()},
         ${clientId}, ${email}, ${"Lead " + email}, ${submittedAt})`;
    }

    async function insertActivity(
      integrationId: string,
      clientId: string,
      kind: "call" | "sms" | "email",
      direction: string,
      leadEmail: string,
      occurredAt: Date,
    ) {
      await sql`
      insert into app.crm_activity
        (integration_id, provider, external_id, client_id, kind, direction, lead_email, occurred_at)
      values
        (${integrationId}, 'close', ${"act-" + leadEmail + "-" + occurredAt.getTime()},
         ${clientId}, ${kind}, ${direction}, ${leadEmail}, ${occurredAt})`;
    }

    it("reads '—'-worthy disconnected state when Close and Typeform aren't BOTH connected", async () => {
      const clientId = await makeClient("half-connected");
      await connectIntegration(clientId, "close", "connected");
      // No typeform integration at all for this client.

      const result = await liveSpeedToLead(clientId);
      expect(result).toEqual({
        connected: false,
        summary: null,
        liveBreaches: [],
        recentBreaches: [],
      });
    });

    it("an integration row with status != connected doesn't count as connected", async () => {
      const clientId = await makeClient("errored");
      await connectIntegration(clientId, "close", "error");
      await connectIntegration(clientId, "typeform", "connected");

      const result = await liveSpeedToLead(clientId);
      expect(result.connected).toBe(false);
    });

    it("joins applications to outbound activity across call/sms/email and both direction vocabularies", async () => {
      const clientId = await makeClient("full");
      const closeIntegrationId = await connectIntegration(clientId, "close");
      const typeformIntegrationId = await connectIntegration(clientId, "typeform");

      const now = new Date();
      const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

      // within@ — an outbound SMS 3 minutes after applying: inside the SLA.
      await insertApplication(
        typeformIntegrationId,
        clientId,
        "within@x.com",
        minutesAgo(20),
      );
      await insertActivity(
        closeIntegrationId,
        clientId,
        "sms",
        "outbound",
        "within@x.com",
        minutesAgo(17), // 3 minutes after the application
      );

      // outgoing-email@ — first contact is an EMAIL using Close's "outgoing"
      // vocabulary (not "outbound"), 20 minutes late. Must still be recognized
      // as the outbound touch (and therefore as a BREACH, not "open").
      await insertApplication(
        typeformIntegrationId,
        clientId,
        "outgoing-email@x.com",
        minutesAgo(30),
      );
      await insertActivity(
        closeIntegrationId,
        clientId,
        "email",
        "outgoing",
        "outgoing-email@x.com",
        minutesAgo(10), // 20 minutes after the application
      );

      // inbound-only@ — applied 2 minutes ago; the only activity captured is
      // INBOUND (they called us first), which must never count as us
      // contacting them. Still inside the SLA clock, so "open" but not overdue.
      await insertApplication(
        typeformIntegrationId,
        clientId,
        "inbound-only@x.com",
        minutesAgo(2),
      );
      await insertActivity(
        closeIntegrationId,
        clientId,
        "call",
        "inbound",
        "inbound-only@x.com",
        minutesAgo(1),
      );

      // stale-breach@ — applied 20 minutes ago, no contact at all: the only
      // application that is an overdue live breach right now.
      await insertApplication(
        typeformIntegrationId,
        clientId,
        "stale-breach@x.com",
        minutesAgo(20),
      );

      const result = await liveSpeedToLead(clientId);
      expect(result.connected).toBe(true);
      expect(result.summary).not.toBeNull();

      // within@ contacted in-SLA via sms
      expect(result.summary!.within).toBe(1);
      // outgoing-email@ WAS reached, just late — the "outgoing" vocabulary
      // counted as outbound, so it's a breach, not a silently-dropped "open".
      expect(result.summary!.breached).toBe(1);
      // inbound-only@ AND stale-breach@ both have no valid OUTBOUND contact
      expect(result.summary!.open).toBe(2);
      // only stale-breach@ has actually crossed the 5-minute line right now
      expect(result.summary!.overdueNow).toBe(1);

      expect(result.liveBreaches.map((b) => b.email)).toEqual(["stale-breach@x.com"]);
      expect(result.liveBreaches[0].waitingSec).toBeGreaterThan(5 * 60);

      expect(result.recentBreaches.map((b) => b.email)).toEqual([
        "outgoing-email@x.com",
      ]);
      expect(result.recentBreaches[0].timeToContactSec).toBeGreaterThan(5 * 60);

      // inbound-only@ never got an outbound touch, so it must appear in
      // neither list: not a live breach yet (under the SLA), and never
      // "recently breached" (that bucket is for LATE contact, not no contact).
      expect(result.liveBreaches.some((b) => b.email === "inbound-only@x.com")).toBe(
        false,
      );
      expect(result.recentBreaches.some((b) => b.email === "inbound-only@x.com")).toBe(
        false,
      );
    });
  },
  30_000,
);
