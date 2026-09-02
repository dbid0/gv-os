"use client";

import { LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ViewAsMenu } from "@/components/shell/view-as";
import { TopClock } from "@/components/shell/top-clock";
import { signOut } from "@/lib/auth/actions";
import type { BellNotification } from "@/lib/notifications/count";
import type { ShellUser } from "@/lib/auth/user";
import { allNavItems } from "@/components/shell/nav-config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsHydrated } from "@/lib/client-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { env } from "@/env";

const fmtMonthCash = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function Topbar({
  user,
  monthCashCents = null,
  unreadCount = 0,
  notifications = [],
  avatarUrl = null,
}: {
  user: ShellUser | null;
  /** Agency cash for the month; null hides the pill (a scoped viewer). */
  monthCashCents?: number | null;
  unreadCount?: number;
  notifications?: BellNotification[];
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  // Longest-prefix match so sub-routes keep their section context; unknown
  // paths prettify their last segment instead of a generic label.
  const current = allNavItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const fallbackLabel = pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/[-_]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <header className="glass sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <MobileNav />

      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">
          {current?.label ?? fallbackLabel ?? "GV OS"}
        </h1>
        {current && (
          <p className="text-muted-foreground truncate text-xs">
            {current.description}
          </p>
        )}
      </div>

      {/* A preview build reading staging data must never be mistaken for prod. */}
      {env.NEXT_PUBLIC_APP_ENV !== "production" && (
        <Badge variant="outline" className="ml-1 shrink-0 text-[10px] uppercase">
          {env.NEXT_PUBLIC_APP_ENV}
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-3">
        <TopClock />
        {/* Agency cash comes from the reconciled finance sheet — the whole
            book, not this viewer's offer. A rep or client must not read it,
            and re-pointing the same label at a smaller number would be a
            second definition of it, so the pill is simply absent for them. */}
        {monthCashCents !== null && (
          <span
            className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:flex"
            title="Cash collected this month, from the reconciled sheet"
          >
            <span className="numeric text-success font-semibold">
              {fmtMonthCash(monthCashCents)}
            </span>
            <span className="text-faint">this month</span>
          </span>
        )}
        <div className="flex items-center gap-1">
          <ViewAsMenu />
          <NotificationBell unreadCount={unreadCount} preview={notifications} />
          <ThemeToggle />
          <UserMenu user={user} avatarUrl={avatarUrl} />
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The resolved theme is unknown until the client renders; showing an icon
  // before that would be a hydration mismatch.
  const hydrated = useIsHydrated();

  const cycle = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");
  };

  const Icon = !hydrated
    ? Monitor
    : theme === "dark"
      ? Moon
      : theme === "light"
        ? Sun
        : Monitor;

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label="Toggle theme">
      <Icon className="size-4" />
    </Button>
  );
}

function UserMenu({
  user,
  avatarUrl,
}: {
  user: ShellUser | null;
  avatarUrl: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Account menu" />}
      >
        <Avatar className="size-7">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-[11px]">
            {user?.initial ?? "?"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* Base UI law: GroupLabel MUST live inside a Group, or the menu
            throws error #31 on open and crashes the page to the error
            boundary. This exact omission broke the profile menu for weeks. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user?.name ?? "Signed out"}</p>
            <p className="text-muted-foreground truncate text-xs">
              {user?.email ?? "No session"}
            </p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />} className="gap-2">
          <User className="size-3.5" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />} className="gap-2">
          <Settings className="size-3.5" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <button
            type="submit"
            className="hover:bg-accent flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
