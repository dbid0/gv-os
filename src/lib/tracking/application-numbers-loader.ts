import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  applications,
  clientTrackingRows,
  crmActivity,
  integrations,
} from "@/db/schema/app";
import type { CallLogRow } from "@/lib/calls/call-log";
import { phoneKey } from "@/lib/crm/close-normalize";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import {
  applicationNumbers,
  type ApplicationNumbers,
  type NumbersApplication,
} from "@/lib/tracking/application-numbers";
import { currentSnapshot } from "@/lib/tracking/queries";
import type { RangeBounds } from "@/lib/transactions/homepage";

/** Newest rows read per page; past either cap the page says so. */
export const APPLICATION_ROW_CAP = 20_000;
export const DIAL_ROW_CAP_FOR_STL = 20_000;

const DAY_MS = 86_400_000;

export type ApplicationNumbersData = {
  numbers: ApplicationNumbers;
  /** Close connected: speed to lead can only be measured with dials. */
  dialsConnected: boolean;
  capped: boolean;
};

/**
 * An offer's application numbers: the synced form applications, or the
 * tracking sheet's Applications tab when the form isn't synced — one source or
 * the other, never both, the same rule speed to lead has always used (the same
 * person in two records would be counted twice). Dials are the offer's
 * outbound Close calls from the window's start on.
 */
export async function loadApplicationNumbers(
  clientId: string,
  calls: CallLogRow[],
  bounds: RangeBounds,
  timeZone: string,
): Promise<ApplicationNumbersData> {
  const db = getDb();
  const dialSince = bounds.from
    ? new Date(Date.parse(`${bounds.from}T00:00:00Z`) - DAY_MS)
    : null;

  const [formApps, dialRows, closeRows, aliases] = await Promise.all([
    db
      .select({
        email: applications.email,
        submittedAt: applications.submittedAt,
        createdAt: applications.createdAt,
        formName: applications.formName,
        utmSource: applications.utmSource,
        utmMedium: applications.utmMedium,
        utmCampaign: applications.utmCampaign,
        utmContent: applications.utmContent,
      })
      .from(applications)
      .where(eq(applications.clientId, clientId))
      .orderBy(desc(applications.createdAt))
      .limit(APPLICATION_ROW_CAP),
    db
      .select({
        email: crmActivity.leadEmail,
        phone: crmActivity.leadPhone,
        occurredAt: crmActivity.occurredAt,
      })
      .from(crmActivity)
      .where(
        and(
          eq(crmActivity.clientId, clientId),
          eq(crmActivity.kind, "call"),
          inArray(crmActivity.direction, ["outbound", "outgoing"]),
          ...(dialSince ? [gte(crmActivity.occurredAt, dialSince)] : []),
        ),
      )
      .orderBy(desc(crmActivity.occurredAt))
      .limit(DIAL_ROW_CAP_FOR_STL),
    db
      .select({ id: integrations.id })
      .from(integrations)
      .where(
        and(
          eq(integrations.provider, "close"),
          eq(integrations.clientId, clientId),
          eq(integrations.status, "connected"),
        ),
      )
      .limit(1),
    aliasMapForClient(clientId),
  ]);

  let source: "form" | "sheet" | null = null;
  let apps: NumbersApplication[] = [];
  if (formApps.length > 0) {
    source = "form";
    apps = formApps.map((a) => ({
      email: a.email,
      phone: null,
      submittedAt: a.submittedAt ?? a.createdAt,
      formName: a.formName,
      tagged: Boolean(a.utmSource || a.utmMedium || a.utmCampaign || a.utmContent),
    }));
  } else {
    const snapshot = await currentSnapshot(clientId);
    if (snapshot) {
      const rows = await db
        .select({
          email: clientTrackingRows.email,
          phone: clientTrackingRows.phone,
          occurredAt: clientTrackingRows.occurredAt,
        })
        .from(clientTrackingRows)
        .where(
          and(
            eq(clientTrackingRows.syncId, snapshot.syncId),
            eq(clientTrackingRows.tab, "applications"),
          ),
        )
        .orderBy(desc(clientTrackingRows.occurredAt))
        .limit(APPLICATION_ROW_CAP);
      if (rows.length > 0) {
        source = "sheet";
        apps = rows.map((r) => ({
          email: r.email,
          phone: phoneKey(r.phone),
          submittedAt: r.occurredAt,
          formName: null,
          tagged: null,
        }));
      }
    }
  }

  return {
    numbers: applicationNumbers({
      source,
      applications: apps,
      calls,
      dials: dialRows
        .filter((d) => d.occurredAt)
        .map((d) => ({
          email: d.email,
          phone: d.phone,
          occurredAtMs: (d.occurredAt as Date).getTime(),
        })),
      bounds,
      timeZone,
      aliases,
    }),
    dialsConnected: closeRows.length > 0,
    capped:
      apps.length === APPLICATION_ROW_CAP || dialRows.length === DIAL_ROW_CAP_FOR_STL,
  };
}
