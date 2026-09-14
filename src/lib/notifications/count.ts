import "server-only";

import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, notifications } from "@/db/schema/app";
import {
  INTEGRITY_KINDS,
  integrityBanner,
  type IntegrityBannerModel,
} from "@/lib/notifications/integrity";

/** Unread badge count — fail-soft: the shell renders even if this read fails. */
export async function unreadNotificationCount(): Promise<number> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(isNull(notifications.readAt));
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export interface BellNotification {
  id: string;
  kind: string;
  severity: string;
  title: string;
  clientName: string | null;
  clientSlug: string | null;
  read: boolean;
}

/** The newest few, for the bell preview dropdown. Fail-soft like the count. */
export async function recentNotifications(limit = 6): Promise<BellNotification[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        severity: notifications.severity,
        title: notifications.title,
        clientName: clients.name,
        clientSlug: clients.slug,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .leftJoin(clients, eq(notifications.clientId, clients.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      clientName: r.clientName,
      clientSlug: r.clientSlug,
      read: r.readAt !== null,
    }));
  } catch {
    return [];
  }
}

/**
 * Unreviewed money-integrity alerts as a banner model, or null. Fail-soft: a
 * read error shows no banner rather than breaking the shell — the alerts are
 * still in the bell and on the reconciliation page.
 */
export async function unreviewedIntegrityBanner(): Promise<IntegrityBannerModel | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        severity: notifications.severity,
        title: notifications.title,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          isNull(notifications.readAt),
          inArray(notifications.kind, [...INTEGRITY_KINDS]),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return integrityBanner(rows);
  } catch {
    return null;
  }
}
