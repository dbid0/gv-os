import "server-only";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { crmActivity, integrations } from "@/db/schema/app";
import { dialingDetail, type DialingDetail } from "@/lib/crm/dialing-detail";
import { inWindow } from "@/lib/tracking/report-window";
import type { RangeBounds } from "@/lib/transactions/homepage";

/** Newest calls read per page load; past it the page says so. */
export const DIAL_ROW_CAP = 20_000;

export type DialingData = {
  /** Close connected for this offer (the only dialler GV OS reads today). */
  connected: boolean;
  detail: DialingDetail;
  /** True when the window held more calls than the cap: the newest were read. */
  capped: boolean;
};

const DAY_MS = 86_400_000;

/**
 * One offer's dialling in a window: the CRM's recorded call rows (Close), read
 * newest first, then windowed on the viewer's calendar by the pure engine's
 * own rule. The SQL bounds are padded a day each side so a viewer far from UTC
 * never loses the edge of their window; the exact cut happens in `inWindow`.
 */
export async function loadDialing(
  clientId: string,
  bounds: RangeBounds,
  timeZone: string,
): Promise<DialingData> {
  const db = getDb();
  const conditions = [eq(crmActivity.clientId, clientId), eq(crmActivity.kind, "call")];
  if (bounds.from) {
    conditions.push(
      gte(
        crmActivity.occurredAt,
        new Date(Date.parse(`${bounds.from}T00:00:00Z`) - DAY_MS),
      ),
    );
  }
  if (bounds.to) {
    conditions.push(
      lt(
        crmActivity.occurredAt,
        new Date(Date.parse(`${bounds.to}T00:00:00Z`) + 2 * DAY_MS),
      ),
    );
  }

  const [connection, rows] = await Promise.all([
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
    db
      .select({
        userId: crmActivity.userId,
        userName: crmActivity.userName,
        direction: crmActivity.direction,
        durationSeconds: crmActivity.durationSeconds,
        occurredAt: crmActivity.occurredAt,
        leadId: crmActivity.leadId,
        leadEmail: crmActivity.leadEmail,
        leadPhone: crmActivity.leadPhone,
        disposition: sql<string | null>`${crmActivity.raw} ->> 'disposition'`,
      })
      .from(crmActivity)
      .where(and(...conditions))
      .orderBy(desc(crmActivity.occurredAt))
      .limit(DIAL_ROW_CAP),
  ]);

  const windowed = rows.filter((r) => inWindow(r.occurredAt, bounds, timeZone));
  return {
    connected: connection.length > 0,
    detail: dialingDetail(windowed, timeZone),
    capped: rows.length === DIAL_ROW_CAP,
  };
}
