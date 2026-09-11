import "server-only";

import { and, eq, gte, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { applications, crmActivity, integrations } from "@/db/schema/app";
import { isOutboundDirection } from "@/lib/crm/close-normalize";
import {
  classifySpeedToLead,
  isSpeedToLeadOverdue,
  summarizeSpeedToLead,
  type SpeedToLeadClassification,
  type SpeedToLeadLiveSummary,
} from "@/lib/funnel/speed-to-lead";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";

/**
 * Speed to lead, LIVE — "which application is late RIGHT NOW", not just
 * "how did we do over the window". Reuses the exact same classifier the unit
 * tests cover; this module is only the DB read and the shaping into display
 * rows.
 *
 * Meaningful only when BOTH Typeform (applications) and Close (contacts) are
 * connected for this client — with only one connected, the other half of the
 * join is structurally empty and any percentage computed from it would be a
 * lie dressed as a number. `connected: false` is the caller's signal to show
 * a quiet hint instead of a chart.
 *
 * Contact matching counts an OUTBOUND call, text, OR email as "first
 * contact" — never Close's own live API (that key is parked for this repo;
 * everything here reads the already-synced capture in `crm_activity`).
 */

const WINDOW_DAYS = 30;
const BREACH_LIST_CAP = 12;

export interface SpeedToLeadBreachRow {
  email: string;
  name: string | null;
  submittedAtMs: number;
}

export interface LiveBreachRow extends SpeedToLeadBreachRow {
  waitingSec: number;
}

export interface RecentBreachRow extends SpeedToLeadBreachRow {
  timeToContactSec: number;
}

/**
 * A discriminated union on `connected` — so a caller that has already
 * checked `stlLive.connected === true` gets `summary` narrowed to a real
 * object by the compiler, rather than needing a redundant null check (or
 * worse, a non-null assertion) at every read.
 */
export type LiveSpeedToLead =
  | {
      connected: true;
      summary: SpeedToLeadLiveSummary;
      /** No contact yet, already past the 5-minute SLA — most-overdue first. */
      liveBreaches: LiveBreachRow[];
      /** Contacted, but after the SLA — most-recent application first. */
      recentBreaches: RecentBreachRow[];
    }
  | {
      /** Typeform and Close aren't BOTH connected for this client. */
      connected: false;
      summary: null;
      liveBreaches: [];
      recentBreaches: [];
    };

export const DISCONNECTED_LIVE_STL: LiveSpeedToLead = {
  connected: false,
  summary: null,
  liveBreaches: [],
  recentBreaches: [],
};

export async function liveSpeedToLead(clientId: string): Promise<LiveSpeedToLead> {
  const db = getDb();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const conns = await db
    .select({ provider: integrations.provider, status: integrations.status })
    .from(integrations)
    .where(
      and(
        inArray(integrations.provider, ["close", "typeform"]),
        eq(integrations.clientId, clientId),
      ),
    );
  const closeConnected = conns.some(
    (c) => c.provider === "close" && c.status === "connected",
  );
  const typeformConnected = conns.some(
    (c) => c.provider === "typeform" && c.status === "connected",
  );
  if (!closeConnected || !typeformConnected) return DISCONNECTED_LIVE_STL;

  const [apps, activity, aliases] = await Promise.all([
    db
      .select({
        email: applications.email,
        name: applications.name,
        submittedAt: applications.submittedAt,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .where(
        and(eq(applications.clientId, clientId), gte(applications.createdAt, since)),
      )
      .limit(500),
    db
      .select({
        kind: crmActivity.kind,
        direction: crmActivity.direction,
        leadEmail: crmActivity.leadEmail,
        leadPhone: crmActivity.leadPhone,
        occurredAt: crmActivity.occurredAt,
      })
      .from(crmActivity)
      .where(
        and(
          eq(crmActivity.clientId, clientId),
          inArray(crmActivity.kind, ["call", "sms", "email"]),
          gte(crmActivity.occurredAt, since),
        ),
      )
      .limit(2000),
    aliasMapForClient(clientId),
  ]);

  const outboundContacts = activity
    .filter((a) => isOutboundDirection(a.direction) && a.occurredAt)
    .map((a) => ({
      email: a.leadEmail,
      phone: a.leadPhone,
      occurredAtMs: a.occurredAt!.getTime(),
    }));

  const rows = classifySpeedToLead(
    apps.map((a) => ({
      email: a.email,
      name: a.name,
      submittedAtMs: (a.submittedAt ?? a.createdAt).getTime(),
    })),
    outboundContacts,
    now.getTime(),
    aliases,
  );

  const summary = summarizeSpeedToLead(rows);

  // A breach row is only actionable with an email to link to the lead's
  // page — a phone-only application (no email captured at all) can't be
  // opened from here, so it's counted in the summary above but left out of
  // these lists rather than rendered as a dead link.
  const hasEmail = (
    r: SpeedToLeadClassification,
  ): r is SpeedToLeadClassification & { email: string } => r.email !== null;

  const liveBreaches: LiveBreachRow[] = rows
    .filter(hasEmail)
    .filter(isSpeedToLeadOverdue)
    .map((r) => ({
      email: r.email,
      name: r.name,
      submittedAtMs: r.submittedAtMs,
      waitingSec: r.waitingSec!,
    }))
    .sort((a, b) => b.waitingSec - a.waitingSec)
    .slice(0, BREACH_LIST_CAP);

  const recentBreaches: RecentBreachRow[] = rows
    .filter(hasEmail)
    .filter((r) => r.status === "breached")
    .map((r) => ({
      email: r.email,
      name: r.name,
      submittedAtMs: r.submittedAtMs,
      timeToContactSec: r.timeToContactSec!,
    }))
    .sort((a, b) => b.submittedAtMs - a.submittedAtMs)
    .slice(0, BREACH_LIST_CAP);

  return { connected: true, summary, liveBreaches, recentBreaches };
}
