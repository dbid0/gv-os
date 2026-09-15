import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { applications, utmLinks } from "@/db/schema/app";
import { loadCallLog } from "@/lib/calls/call-log-loader";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import {
  sourceFunnel,
  type SourceDimension,
  type SourceFunnel,
} from "@/lib/tracking/source-funnel";

export type SourceFunnelData = {
  funnel: SourceFunnel;
  /** Applications read, and how many carried any UTM tag at all. */
  applications: number;
  taggedApplications: number;
  links: number;
};

/**
 * One offer's source funnel: its UTM registry links, its synced applications
 * (the form's hidden UTM fields), and the same call log the Calls page shows.
 * Sequenced in two small bursts so one request never holds many connections.
 */
export async function loadSourceFunnel(
  clientId: string,
  countedCallSources: string[] | null,
  dimension: SourceDimension,
  now: Date,
): Promise<SourceFunnelData> {
  const db = getDb();
  const [links, apps, aliases] = await Promise.all([
    db
      .select({
        utmSource: utmLinks.utmSource,
        utmMedium: utmLinks.utmMedium,
        utmCampaign: utmLinks.utmCampaign,
        clickCount: utmLinks.clickCount,
      })
      .from(utmLinks)
      .where(eq(utmLinks.clientId, clientId)),
    db
      .select({
        email: applications.email,
        submittedAt: applications.submittedAt,
        utmSource: applications.utmSource,
        utmMedium: applications.utmMedium,
        utmCampaign: applications.utmCampaign,
      })
      .from(applications)
      .where(eq(applications.clientId, clientId))
      .orderBy(desc(applications.submittedAt))
      .limit(5000),
    aliasMapForClient(clientId),
  ]);
  const { log } = await loadCallLog(clientId, countedCallSources, now);
  return {
    funnel: sourceFunnel({ links, applications: apps, calls: log, dimension, aliases }),
    applications: apps.length,
    taggedApplications: apps.filter((a) => a.utmSource || a.utmMedium || a.utmCampaign)
      .length,
    links: links.length,
  };
}
