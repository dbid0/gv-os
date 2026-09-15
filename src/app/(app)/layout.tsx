import type { ReactNode } from "react";
import { Suspense } from "react";
import { cookies } from "next/headers";

import { CommandPalette } from "@/components/shell/command-palette";
import { ViewAsBanner } from "@/components/shell/view-as";
import { DealClosedToasts } from "@/components/shell/deal-closed-toasts";
import { IntegrityBanner } from "@/components/shell/integrity-banner";
import { PageTransition } from "@/components/shell/page-transition";
import { Sidebar } from "@/components/shell/sidebar";
import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { Topbar } from "@/components/shell/topbar";
import { currentMonthCash } from "@/lib/accounting/sheet-sync";
import {
  recentNotifications,
  unreadNotificationCount,
  unreviewedIntegrityBanner,
} from "@/lib/notifications/count";
import { getPrefs } from "@/lib/prefs";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { loadRoster } from "@/lib/roster-server";
import { shellUser } from "@/lib/auth/user";
import { effectiveRole, type Role } from "@/lib/auth/roles";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { viewerRole } from "@/lib/auth/viewer";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import { ViewerTimeZoneProvider } from "@/components/shell/time-zone";

/**
 * The authenticated application shell — STREAMING.
 *
 * The layout itself renders the frame with zero data: the sidebar, topbar and
 * palette are Suspense-wrapped async components that fetch their own inputs,
 * and {children} sits OUTSIDE those boundaries. First paint (and every page's
 * own loading skeleton) no longer waits on a single shell query — the chrome
 * fills in beside the page instead of in front of it. The middleware already
 * guarantees a session, so the fallbacks are skeletons, never auth states.
 */

async function shownRoleFor(previewRole: string | null): Promise<Role> {
  const user = await shellUser();
  const realRole = await resolveRealRole(user?.email ?? null);
  const previewIsRole = (v: string | null): v is Role =>
    v === "sales_manager" || v === "sales_rep" || v === "team_member" || v === "client";
  return effectiveRole(realRole, previewIsRole(previewRole) ? previewRole : null);
}

async function ShellSidebar({ previewRole }: { previewRole: string | null }) {
  const [user, roster, shownRole] = await Promise.all([
    shellUser(),
    loadRoster(),
    shownRoleFor(previewRole),
  ]);
  return <Sidebar user={user} previewRole={shownRole} roster={roster} />;
}

function SidebarFallback() {
  return (
    <aside className="bg-sidebar hidden w-[248px] shrink-0 animate-pulse flex-col gap-3 border-r p-4 md:flex">
      <div className="bg-secondary/60 h-8 w-32 rounded-md" />
      <div className="bg-secondary/60 h-9 w-full rounded-md" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-secondary/40 h-7 w-full rounded-md" />
        ))}
      </div>
    </aside>
  );
}

async function ShellTopbar() {
  const [user, monthCash, unreadCount, notifications, scope, roster, integrity] =
    await Promise.all([
      shellUser(),
      currentMonthCash(),
      unreadNotificationCount(),
      recentNotifications(),
      getViewerScope(),
      loadRoster(),
      unreviewedIntegrityBanner(),
    ]);
  // Money alarms are the owners' — decided by the viewer's role (preview
  // narrowing included), not by client scope: a manager with every lane in
  // scope still doesn't review the agency's books.
  const ownerView = integrity !== null && (await viewerRole()) === "admin";
  const prefs = await getPrefs(user?.email ?? null, ["avatar", "display-name"]);
  const avatarUrl =
    typeof prefs["avatar"] === "string" ? (prefs["avatar"] as string) : null;
  return (
    <>
      <Topbar
        roster={roster.map((c) => ({ slug: c.slug, name: c.name }))}
        user={user}
        monthCash={scope.restricted ? null : monthCash}
        unreadCount={unreadCount}
        notifications={notifications}
        avatarUrl={avatarUrl}
      />
      {ownerView && integrity && <IntegrityBanner model={integrity} />}
    </>
  );
}

async function ShellPalette() {
  const roster = await loadRoster();
  return (
    <CommandPalette roster={roster.map((c) => ({ slug: c.slug, name: c.name }))} />
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const previewRole = cookieStore.get("gv-dev-role")?.value ?? null;
  const timeZone = await viewerTimeZone();

  return (
    <ViewerTimeZoneProvider timeZone={timeZone}>
      <div className="flex h-dvh overflow-hidden">
        <Suspense fallback={<SidebarFallback />}>
          <ShellSidebar previewRole={previewRole} />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="glass h-14 shrink-0 border-b" />}>
            <ShellTopbar />
          </Suspense>
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <Suspense>
          <ShellPalette />
        </Suspense>
        {previewRole && <ViewAsBanner role={previewRole} />}
        <DealClosedToasts />
        <TabKeepWarm />
      </div>
    </ViewerTimeZoneProvider>
  );
}
