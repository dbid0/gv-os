import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityLogs, clients, reps } from "@/db/schema/app";

/**
 * The Call Log read layer.
 *
 * Server-only functions that pull logged activity as real rows, most recent
 * first. Nothing here invents a number: an empty table means an honest empty
 * state, and every metric on the page is derived from these rows through the
 * pure, fully covered call-activity module.
 */

/** A logged activity shaped for the Call History table and its summary. */
export interface CallLogRow {
  id: string;
  mode: string;
  clientId: string;
  teamName: string | null;
  repId: string | null;
  repName: string | null;
  repRole: string | null;
  callType: string | null;
  disposition: string;
  recordingUrl: string | null;
  leadUrl: string | null;
  customerName: string | null;
  customerEmail: string | null;
  notes: string | null;
  occurredAt: Date;
  source: string;
}

/**
 * Every logged activity, newest first, with its team and rep resolved.
 *
 * Capped defensively so the page stays inside the connection-pool burst budget
 * however many logs accumulate; the summary KPIs and the filters run over the
 * returned set in the client view.
 */
export async function listCallLogs(limit = 500): Promise<CallLogRow[]> {
  const db = getDb();
  return db
    .select({
      id: activityLogs.id,
      mode: activityLogs.mode,
      clientId: activityLogs.clientId,
      teamName: clients.name,
      repId: activityLogs.repId,
      repName: reps.name,
      repRole: reps.role,
      callType: activityLogs.callType,
      disposition: activityLogs.disposition,
      recordingUrl: activityLogs.recordingUrl,
      leadUrl: activityLogs.leadUrl,
      customerName: activityLogs.customerName,
      customerEmail: activityLogs.customerEmail,
      notes: activityLogs.notes,
      occurredAt: activityLogs.occurredAt,
      source: activityLogs.source,
    })
    .from(activityLogs)
    .leftJoin(clients, eq(activityLogs.clientId, clients.id))
    .leftJoin(reps, eq(activityLogs.repId, reps.id))
    .orderBy(desc(activityLogs.occurredAt))
    .limit(limit);
}
