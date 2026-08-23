"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Check } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/app/(app)/notifications/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import type { BellNotification } from "@/lib/notifications/count";
import { notificationHref } from "@/lib/notifications/links";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-brand",
};

/**
 * The bell: a preview dropdown of the newest alerts (Daniel's ask). Each row
 * links to the spot that fixes it, with a per-row "Mark read"; a red "Mark
 * all read" sits in the header, and "See all" opens the full tab. Reads are
 * optimistic — the row settles instantly and the server catches up.
 */
export function NotificationBell({
  unreadCount,
  preview,
}: {
  unreadCount: number;
  preview: BellNotification[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);

  const isRead = (n: BellNotification) => allRead || n.read || readIds.has(n.id);
  const unread = allRead ? 0 : Math.max(0, unreadCount - readIds.size);

  const run = (
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

  const markOne = (id: string) =>
    run(
      () => markNotificationsRead([id]),
      () => setReadIds((s) => new Set(s).add(id)),
      () =>
        setReadIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
    );

  const markAll = () =>
    run(
      () => markAllNotificationsRead(),
      () => setAllRead(true),
      () => setAllRead(false),
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="hover:bg-accent relative rounded-md p-2 transition-colors"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="bg-destructive absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full text-[9px] font-bold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                markAll();
              }}
              className="text-destructive text-xs font-medium hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {preview.length === 0 ? (
          <p className="text-faint px-3 py-8 text-center text-sm">All clear.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {preview.map((n) => {
              const read = isRead(n);
              return (
                <div
                  key={n.id}
                  className="hover:bg-accent group flex items-start gap-2.5 px-3 py-2 transition-colors"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      DOT[n.severity] ?? "bg-muted",
                      read && "opacity-30",
                    )}
                  />
                  <Link
                    href={notificationHref(n.kind, n.clientSlug)}
                    className="min-w-0 flex-1"
                  >
                    <span
                      className={cn("block truncate text-sm", !read && "font-medium")}
                    >
                      {n.title}
                    </span>
                    {n.clientName && (
                      <span className="text-faint text-[11px]">{n.clientName}</span>
                    )}
                  </Link>
                  {!read && (
                    <button
                      type="button"
                      aria-label="Mark read"
                      title="Mark read"
                      onClick={(e) => {
                        e.preventDefault();
                        markOne(n.id);
                      }}
                      className="text-faint hover:text-foreground shrink-0 rounded-md p-1 opacity-0 transition-all group-hover:opacity-100"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Link
          href="/notifications"
          className="text-brand hover:bg-accent block border-t px-3 py-2 text-center text-xs font-medium transition-colors"
        >
          See all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
