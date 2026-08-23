import { desc, eq } from "drizzle-orm";

import {
  NotificationsPanel,
  type NotificationRow,
} from "@/components/notifications/notifications-panel";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import { clients, notifications } from "@/db/schema/app";

export const metadata = { title: "Notifications - GV OS" };
export const dynamic = "force-dynamic";

/** The notifications tab (v2 §5): what needs attention, rule-evaluated on
 * every sync cycle, deduped forever. */
export default async function NotificationsPage() {
  const db = getDb();
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      severity: notifications.severity,
      title: notifications.title,
      body: notifications.body,
      clientName: clients.name,
      clientSlug: clients.slug,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .leftJoin(clients, eq(notifications.clientId, clients.id))
    .orderBy(desc(notifications.createdAt))
    .limit(200);

  const shaped: NotificationRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    title: r.title,
    body: r.body,
    clientName: r.clientName,
    clientSlug: r.clientSlug,
    createdAt: r.createdAt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    }),
    read: r.readAt !== null,
  }));
  const unread = shaped.filter((r) => !r.read).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Needs"
        highlight="attention."
        description="Rules run on every sync cycle over everything captured — money drift, signed agreements, the daily digest — and each alert exists exactly once. Click any alert to jump to the spot that resolves it."
        status={
          <StatusPill tone={unread > 0 ? "progress" : "good"}>
            {unread > 0 ? `${unread} unread` : "All clear"}
          </StatusPill>
        }
      />
      <NotificationsPanel rows={shaped} />
    </div>
  );
}
