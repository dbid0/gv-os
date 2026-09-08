import { notFound } from "next/navigation";
import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { Kpi } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { getDb } from "@/db/client";
import {
  applications,
  clients,
  clientTrackingRows,
  deals,
  integrations,
} from "@/db/schema/app";
import { currentSnapshot } from "@/lib/tracking/queries";
import { listTeamspaceTodos } from "@/lib/workspace/queries";
import { rosterClientBySlug } from "@/lib/roster-server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Workspace → Onboarding: where THIS client's install actually stands.
 *
 * It used to be five hard-coded stage cards, identical for every client and
 * wired to nothing — Daniel: "this onboarding section doesn't even work." It
 * was decoration.
 *
 * Now every line is a real signal about this client:
 *   • the install checklist IS the teamspace To-Do board (the same rows the
 *     workspace Home shows), so ticking a task there moves this page — one
 *     list, not a second one to keep in sync;
 *   • the milestones read from live tables — a connected integration, a real
 *     application, a logged deal.
 *
 * Nothing here is inferred: a milestone is done because a row exists.
 */
export default async function WorkspaceOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const clientId = row?.id ?? null;

  // The sheet mirror is evidence too: an offer whose applications live on
  // its tracking sheet has a live funnel, whatever the synced tables hold.
  // Without this, the milestone said "0 applications" beside a funnel page
  // proving hundreds.
  const snapshot = clientId ? await currentSnapshot(clientId) : null;
  const [todos, connected, apps, closed, mirror] = await Promise.all([
    clientId ? listTeamspaceTodos(clientId) : Promise.resolve([]),
    clientId
      ? db
          .select({ n: count() })
          .from(integrations)
          .where(
            and(
              eq(integrations.clientId, clientId),
              eq(integrations.status, "connected"),
            ),
          )
      : Promise.resolve([{ n: 0 }]),
    clientId
      ? db
          .select({ n: count() })
          .from(applications)
          .where(eq(applications.clientId, clientId))
      : Promise.resolve([{ n: 0 }]),
    clientId
      ? db.select({ n: count() }).from(deals).where(eq(deals.clientId, clientId))
      : Promise.resolve([{ n: 0 }]),
    snapshot
      ? db
          .select({ tab: clientTrackingRows.tab, n: count() })
          .from(clientTrackingRows)
          .where(
            and(
              eq(clientTrackingRows.syncId, snapshot.syncId),
              inArray(clientTrackingRows.tab, ["applications", "deals"]),
            ),
          )
          .groupBy(clientTrackingRows.tab)
      : Promise.resolve([] as { tab: string; n: number }[]),
  ]);
  const mirrorN = (tab: string) => Number(mirror.find((m) => m.tab === tab)?.n ?? 0);
  // Max, never a sum — the same person often exists in both records.
  const appCount = Math.max(Number(apps[0]?.n ?? 0), mirrorN("applications"));
  const dealCount = Math.max(Number(closed[0]?.n ?? 0), mirrorN("deals"));

  const done = todos.filter((t) => t.status === "Done").length;
  const inProgress = todos.filter((t) => t.status === "In progress").length;
  const pct = todos.length === 0 ? null : Math.round((done / todos.length) * 100);

  const milestones = [
    {
      title: "Stack connected",
      detail: "A tool is connected and syncing for this offer",
      done: (connected[0]?.n ?? 0) > 0,
      value: `${connected[0]?.n ?? 0} connected`,
    },
    {
      title: "Funnel live",
      detail: "The application has taken its first real submission",
      done: appCount > 0,
      value: `${appCount} applications`,
    },
    {
      title: "First deal",
      detail: "A deal has been logged against this offer",
      done: dealCount > 0,
      value: `${dealCount} deals`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Install checklist"
          value={pct === null ? "—" : `${pct}%`}
          tone={pct === 100 ? "success" : "brand"}
        />
        <Kpi label="Done" value={`${done} / ${todos.length}`} />
        <Kpi label="In progress" value={String(inProgress)} />
      </div>

      <Panel
        title="Install checklist"
        aside={
          <Link
            href={`/clients/${slug}/workspace`}
            className="text-faint hover:text-foreground text-xs transition-colors"
          >
            Edit in the workspace →
          </Link>
        }
      >
        {todos.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No install tasks yet. They live on this teamspace&apos;s To-Do board — add
            them in the workspace and they appear here.
          </p>
        ) : (
          <div className="divide-y">
            {todos.map((t) => {
              const isDone = t.status === "Done";
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  {isDone ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" />
                  ) : t.status === "In progress" ? (
                    <CircleDashed className="text-warning size-4 shrink-0" />
                  ) : (
                    <Circle className="text-faint size-4 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      isDone && "text-faint line-through",
                    )}
                  >
                    {t.task}
                  </span>
                  {t.dueDate && (
                    <span className="text-faint text-xs tabular-nums">{t.dueDate}</span>
                  )}
                  <StatusPill tone={isDone ? "live" : "pending"}>{t.status}</StatusPill>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Milestones">
        <div className="divide-y">
          {milestones.map((m) => (
            <div key={m.title} className="flex items-center gap-3 py-3">
              {m.done ? (
                <CheckCircle2 className="text-success size-4 shrink-0" />
              ) : (
                <Circle className="text-faint size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{m.title}</span>
                <span className="text-faint block text-xs">{m.detail}</span>
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
