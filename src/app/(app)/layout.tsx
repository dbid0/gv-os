import type { ReactNode } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { DealClosedToasts } from "@/components/shell/deal-closed-toasts";
import { PageTransition } from "@/components/shell/page-transition";
import { Sidebar } from "@/components/shell/sidebar";
import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { Topbar } from "@/components/shell/topbar";
import { currentMonthCashCents } from "@/lib/accounting/sheet-sync";
import { unreadNotificationCount } from "@/lib/notifications/count";
import { shellUser } from "@/lib/auth/user";

/**
 * The authenticated application shell.
 *
 * The user is resolved ONCE here and passed down, rather than every component
 * fetching it. The middleware already guarantees a session exists by the time
 * this renders, so there is no loading state to design around.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, monthCashCents, unreadCount] = await Promise.all([
    shellUser(),
    currentMonthCashCents(),
    unreadNotificationCount(),
  ]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} monthCashCents={monthCashCents} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <CommandPalette />
      <DealClosedToasts />
      <TabKeepWarm />
    </div>
  );
}
