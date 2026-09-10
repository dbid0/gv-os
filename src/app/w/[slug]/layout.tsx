import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";

import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { TopClock } from "@/components/shell/top-clock";
import { ViewAsBanner } from "@/components/shell/view-as";
import { WorkspaceLogo } from "@/components/workspace/workspace-logo";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { getDb } from "@/db/client";
import { clients as clientsTable } from "@/db/schema/app";
import { eq } from "drizzle-orm";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { clientInitial } from "@/lib/roster";
import { rosterClientBySlug } from "@/lib/roster-server";

/**
 * v2 two-view architecture (spec §1): a client WORKSPACE — the reference
 * product's sub-account shape. Inside a client, the LEFT SIDEBAR is that
 * client's nav (Tracking / Leads / Operations); the whole shell re-skins to
 * their accent. The old top tab row survives only below md, where a sidebar
 * has no room. One click back to Admin lives at the top of the sidebar.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  const cookieStore = await cookies();
  const previewRole = cookieStore.get("gv-dev-role")?.value ?? null;
  const clientPreview = previewRole === "client";
  // One door: an owner sees this client's admin surfaces from inside the
  // workspace, so there is no second "Manage" entry point to guess between.
  const admin = await viewerIsAdmin();
  const db = getDb();
  const [row] = await db
    .select({ logo: clientsTable.logo })
    .from(clientsTable)
    .where(eq(clientsTable.slug, slug))
    .limit(1);
  const logo = row?.logo ?? null;

  const skin = {
    "--brand": client.accent,
    "--brand-soft": `color-mix(in oklab, ${client.accent} 16%, var(--background))`,
  } as CSSProperties;

  const identity = (
    <div className="flex items-center gap-2.5">
      <WorkspaceLogo
        slug={slug}
        logo={logo}
        initial={clientInitial(client.name)}
        accent={client.accent}
        editable={!clientPreview}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{client.name}</p>
        <p className="text-faint truncate text-[11px]">
          {client.owner} · client workspace
        </p>
      </div>
    </div>
  );

  return (
    <div style={skin} className="flex h-dvh overflow-hidden">
      <WorkspaceSidebar
        slug={slug}
        admin={admin}
        clientPreview={clientPreview}
        identity={identity}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          {/* Identity lives in the sidebar on desktop; on mobile it leads
              the header so the page still says whose world this is. */}
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">{identity}</div>
          <div className="ml-auto flex items-center gap-3">
            <TopClock />
          </div>
        </header>
        {/* Below md the sidebar has no room — the tab row carries the nav. */}
        <div className="border-b px-4 py-2 md:hidden">
          <WorkspaceNav slug={slug} admin={admin} />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      <TabKeepWarm />
      {previewRole && <ViewAsBanner role={previewRole} clientName={client.name} />}
    </div>
  );
}
