import "server-only";

import { and, eq, gte } from "drizzle-orm";

import { and as andOp, eq as eqOp } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  applications,
  clientTrackingRows,
  crmActivity,
  integrations,
} from "@/db/schema/app";
import { phoneKey } from "@/lib/crm/close-normalize";
import { computeSpeedToLead } from "@/lib/funnel/speed-to-lead";
import { currentSnapshot } from "@/lib/tracking/queries";

/**
 * ONE offer's speed to lead — application in, first dial out.
 *
 * The number the whole sales motion is judged on: the 5-minute standard is
 * non-negotiable, so this is the FIRST thing a sales surface should say.
 * Measured only from the dialler's own record (Close activity); when the CRM
 * isn't connected the answer is honestly unknown — never estimated from the
 * sheet, whose call rows carry almost no timestamps.
 */
export interface OfferStl {
  connected: boolean;
  medianMinutes: number | null;
  /** Share dialled within 5 minutes, 0..1, or null when unmeasurable. */
  slaPct: number | null;
  measured: number;
  /** Applications in the window that carry a join key at all. */
  applications: number;
  /** Of those, how many were EVER dialled in the CRM (any window). Zero with
   * applications present names the operational disconnect: the floor's dials
   * are not touching the application list. */
  everDialed: number;
}

const WINDOW_DAYS = 30;

export async function offerSpeedToLead(clientId: string): Promise<OfferStl> {
  const db = getDb();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

  const [conn] = await db
    .select({ status: integrations.status })
    .from(integrations)
    .where(and(eq(integrations.provider, "close"), eq(integrations.clientId, clientId)))
    .limit(1);
  const connected = conn?.status === "connected";
  if (!connected) {
    return {
      connected: false,
      medianMinutes: null,
      slaPct: null,
      measured: 0,
      applications: 0,
      everDialed: 0,
    };
  }

  // eslint-disable-next-line prefer-const -- apps is reassigned by the sheet fallback below
  let [apps, calls] = await Promise.all([
    db
      .select({
        email: applications.email,
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
        occurredAt: crmActivity.occurredAt,
        leadEmail: crmActivity.leadEmail,
        leadPhone: crmActivity.leadPhone,
      })
      .from(crmActivity)
      .where(
        // All captured calls, not just the window — everDialed asks whether an
        // applicant was EVER dialled, and the capture horizon is the real limit.
        and(eq(crmActivity.clientId, clientId), eq(crmActivity.kind, "call")),
      )
      .limit(1000),
  ]);

  // The synced applications table is the first choice; when it's empty the
  // sheet mirror answers — its application rows carry emails and timestamps,
  // and an offer whose intake lives on the sheet must not read as "no
  // applications" beside a funnel full of them. One source or the other,
  // never both: the same person in two records would be measured twice.
  if (apps.length === 0) {
    const snapshot = await currentSnapshot(clientId);
    if (snapshot) {
      const mirrored = await db
        .select({
          email: clientTrackingRows.email,
          phone: clientTrackingRows.phone,
          occurredAt: clientTrackingRows.occurredAt,
        })
        .from(clientTrackingRows)
        .where(
          andOp(
            eqOp(clientTrackingRows.syncId, snapshot.syncId),
            eqOp(clientTrackingRows.tab, "applications"),
          ),
        )
        .limit(2000);
      apps = mirrored
        .filter((m) => (m.email !== null || m.phone !== null) && m.occurredAt !== null)
        .filter((m) => m.occurredAt! >= since)
        .map((m) => ({
          email: m.email,
          phone: m.phone,
          submittedAt: m.occurredAt,
          createdAt: m.occurredAt as Date,
        }));
    }
  }

  const stl = computeSpeedToLead(
    apps.map((a) => ({
      email: a.email,
      // The synced applications table carries no phone yet; the sheet
      // fallback does. phoneKey(null) is null, so email-only sources lose
      // nothing.
      phone: phoneKey((a as { phone?: string | null }).phone ?? null),
      submittedAtMs: (a.submittedAt ?? a.createdAt).getTime(),
    })),
    calls
      .filter((c) => c.occurredAt)
      .map((c) => ({
        email: c.leadEmail,
        phone: c.leadPhone,
        occurredAtMs: c.occurredAt!.getTime(),
      })),
  );
  // The disconnect check: did ANY applicant ever get dialled?
  const callEmails = new Set(
    calls.map((c) => c.leadEmail).filter((e): e is string => Boolean(e)),
  );
  const callPhones = new Set(
    calls.map((c) => c.leadPhone).filter((p): p is string => Boolean(p)),
  );
  const joinable = apps.filter(
    (a) => a.email || phoneKey((a as { phone?: string | null }).phone ?? null),
  );
  const everDialed = joinable.filter((a) => {
    const phone = phoneKey((a as { phone?: string | null }).phone ?? null);
    return (
      (a.email !== null && callEmails.has(a.email.trim().toLowerCase())) ||
      (phone !== null && callPhones.has(phone))
    );
  }).length;

  return {
    connected: true,
    medianMinutes: stl.medianMinutes,
    slaPct: stl.slaPct,
    measured: stl.matched,
    applications: joinable.length,
    everDialed,
  };
}
