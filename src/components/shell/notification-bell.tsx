"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BellNotification } from "@/lib/notifications/count";
import { notificationHref } from "@/lib/notifications/links";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-brand",
};

/**
 * The bell: a preview dropdown of the newest alerts (Daniel's ask), each a
 * link to the spot that fixes it, with "See all" to the full tab. Badge and
 * preview both come from the shell's single read.
 */
export function NotificationBell({
  unreadCount,
  preview,
}: {
  unreadCount: number;
  preview: BellNotification[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="hover:bg-accent relative rounded-md p-2 transition-colors"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="bg-destructive absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full text-[9px] font-bold text-white tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-faint text-xs">{unreadCount} unread</span>
          )}
        </div>

        {preview.length === 0 ? (
          <p className="text-faint px-3 py-8 text-center text-sm">All clear.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {preview.map((n) => (
              <Link
                key={n.id}
                href={notificationHref(n.kind, n.clientSlug)}
                className="hover:bg-accent flex items-start gap-2.5 px-3 py-2 transition-colors"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    DOT[n.severity] ?? "bg-muted",
                    n.read && "opacity-40",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn("block truncate text-sm", !n.read && "font-medium")}
                  >
                    {n.title}
                  </span>
                  {n.clientName && (
                    <span className="text-faint text-[11px]">{n.clientName}</span>
                  )}
                </span>
              </Link>
            ))}
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
