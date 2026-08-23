"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight, Check, CheckCheck } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { notificationHref } from "@/lib/notifications/links";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<string, StatusTone> = {
  info: "good",
  warning: "progress",
  critical: "danger",
};

export interface NotificationRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  clientName: string | null;
  clientSlug: string | null;
  createdAt: string;
  read: boolean;
}

export function NotificationsPanel({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // Optimistic reads (P1-5): the click moves the item instantly; the server
  // catches up, and a failure rolls back with a toast.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const unread = rows.filter((r) => !r.read && !readIds.has(r.id));
  const read = rows.filter((r) => r.read || readIds.has(r.id));

  // Duplicates collapse into one row with a stack count (punch-list 17), and
  // severity pins critical above warning above info so the one real signal
  // never drowns under seven copies of good news.
  const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const groupOf = (list: NotificationRow[]) => {
    const byKey = new Map<string, NotificationRow[]>();
    for (const r of list) {
      const key = `${r.kind}|${r.title}|${r.clientName ?? ""}`;
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
    return [...byKey.values()].sort(
      (a, b) =>
        (SEVERITY_ORDER[a[0].severity] ?? 3) - (SEVERITY_ORDER[b[0].severity] ?? 3),
    );
  };
  const unreadGroups = groupOf(unread);
  const readGroups = groupOf(read.slice(0, 30));

  const act = (
    fn: () => Promise<unknown>,
    optimistic: () => void,
    rollback: () => void,
  ) => {
    optimistic();
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        rollback();
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });
  };

  const item = (group: NotificationRow[]) => {
    const r = group[0];
    return (
      <div
        key={r.id}
        className={cn(
          "bg-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3",
          !r.read && "border-brand/30",
        )}
      >
        <StatusPill tone={SEVERITY_TONE[r.severity] ?? "muted"}>
          {r.severity}
        </StatusPill>
        <Link
          href={notificationHref(r.kind, r.clientSlug)}
          className="group min-w-0 flex-1"
        >
          <p
            className={cn(
              "flex items-center gap-2 truncate text-sm",
              !r.read && "font-medium",
            )}
          >
            <span className="group-hover:text-brand truncate transition-colors">
              {r.title}
            </span>
            {group.length > 1 && (
              <span className="bg-secondary text-muted-foreground rounded-full px-1.5 text-[10px] font-medium">
                ×{group.length}
              </span>
            )}
            <ArrowUpRight className="text-faint size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </p>
          {r.body && <p className="text-faint truncate text-[11px]">{r.body}</p>}
        </Link>
        {r.clientName && (
          <span className="text-muted-foreground rounded-full border px-1.5 text-[11px]">
            {r.clientName}
          </span>
        )}
        <span className="text-faint text-[11px] whitespace-nowrap">{r.createdAt}</span>
        {!r.read && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => markNotificationsRead(group.map((g) => g.id)),
                () =>
                  setReadIds((ids) => {
                    const next = new Set(ids);
                    for (const g of group) next.add(g.id);
                    return next;
                  }),
                () =>
                  setReadIds((ids) => {
                    const next = new Set(ids);
                    for (const g of group) next.delete(g.id);
                    return next;
                  }),
              )
            }
            className="text-faint hover:text-foreground rounded-md border px-2 py-1 text-[11px] transition-colors"
            aria-label="Mark read"
          >
            <Check className="size-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Panel
        title={`Unread — ${unread.length}`}
        aside={
          unread.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                act(
                  () => markAllNotificationsRead(),
                  () => setReadIds(new Set(rows.map((r) => r.id))),
                  () => setReadIds(new Set()),
                )
              }
              className="gap-1.5"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          ) : undefined
        }
      >
        {unread.length === 0 ? (
          <p className="text-faint py-6 text-center text-sm">All clear.</p>
        ) : (
          <div className="space-y-2">{unreadGroups.map(item)}</div>
        )}
      </Panel>

      {read.length > 0 && (
        <Panel title="Earlier">
          <div className="space-y-2">{readGroups.map(item)}</div>
        </Panel>
      )}

      <Panel title="Rules waiting on data">
        <p className="text-faint text-sm">
          Live now: sheet drift, signed agreements, and the daily BOD digest (per-offer
          alert times, 12:00 CT default). Sync-health alerts arm once integrations carry
          real traffic; speed-to-lead breaches arm with Close + bookings data;
          payment-without-a-sale-form arms with processor events. Each starts firing the
          moment its source connects.
        </p>
      </Panel>
    </div>
  );
}
