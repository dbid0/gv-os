import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { CommandPalette } from "@/components/shell/command-palette";
import { ViewAsBanner } from "@/components/shell/view-as";
import { DealClosedToasts } from "@/components/shell/deal-closed-toasts";
import { PageTransition } from "@/components/shell/page-transition";
import { Sidebar } from "@/components/shell/sidebar";
import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { Topbar } from "@/components/shell/topbar";
import { currentMonthCashCents } from "@/lib/accounting/sheet-sync";
import {
  recentNotifications,
  unreadNotificationCount,
} from "@/lib/notifications/count";
import { getPrefs } from "@/lib/prefs";
import { shellUser } from "@/lib/auth/user";
import { effectiveRole, type Role } from "@/lib/auth/roles";
import { resolveRealRole } from "@/lib/auth/resolve-role";

/**
 * The authenticated application shell.
 *
 * The user is resolved ONCE here and passed down, rather than every component
 * fetching it. The middleware already guarantees a session exists by the time
 * this renders, so there is no loading state to design around.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await shellUser();
  const [monthCashCents, unreadCount, notifications, cookieStore, prefs, realRole] =
    await Promise.all([
      currentMonthCashCents(),
      unreadNotificationCount(),
      recentNotifications(),
      cookies(),
      getPrefs(user?.email ?? null, ["avatar", "display-name"]),
      resolveRealRole(user?.email ?? null),
    ]);
  const avatarUrl =
    typeof prefs["avatar"] === "string" ? (prefs["avatar"] as string) : null;
  const previewRole = cookieStore.get("gv-dev-role")?.value ?? null;
  const previewIsRole = (v: string | null): v is Role =>
    v === "sales_manager" || v === "sales_rep" || v === "team_member" || v === "client";
  // The role the shell actually renders for: the user's REAL role, narrowed by
  // an admin's restrict-only "View as" preview. A non-admin ignores the preview
  // cookie, so it can never widen the nav. Admin -> full nav (Sidebar treats
  // "admin" as no filter). The banner below still keys off the raw cookie, so it
  // only shows while an admin is actively previewing.
  const shownRole = effectiveRole(
    realRole,
    previewIsRole(previewRole) ? previewRole : null,
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar user={user} previewRole={shownRole} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          monthCashCents={monthCashCents}
          unreadCount={unreadCount}
          notifications={notifications}
          avatarUrl={avatarUrl}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <CommandPalette />
      {previewRole && <ViewAsBanner role={previewRole} />}
      <DealClosedToasts />
      <TabKeepWarm />
    </div>
  );
}
