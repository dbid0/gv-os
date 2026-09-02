import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { TopClock } from "@/components/shell/top-clock";
import { ViewAsBanner } from "@/components/shell/view-as";
import { WorkspaceLogo } from "@/components/workspace/workspace-logo";
import { getDb } from "@/db/client";
import { clients as clientsTable } from "@/db/schema/app";
import { eq } from "drizzle-orm";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { clientBySlug, clientInitial } from "@/lib/roster";

/**
 * v2 two-view architecture (spec §1): a client WORKSPACE. The whole shell
 * re-skins to the client — their accent becomes --brand for everything
 * inside, so every brand-colored element wears their color with zero
 * per-component work. Client logos land when Daniel uploads them; the
 * accent-tinted mark stands in until then. One click back to Admin, always
 * visible top-left.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
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

  return (
    <div style={skin} className="flex h-dvh flex-col overflow-hidden">
      <header className="glass sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        {!clientPreview && (
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Admin
          </Link>
        )}
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
        <div className="ml-auto flex items-center gap-3">
          <TopClock />
        </div>
      </header>
      <div className="border-b px-4 py-2 md:px-6">
        <WorkspaceNav slug={slug} admin={admin} />
      </div>
      <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      <TabKeepWarm />
      {previewRole && <ViewAsBanner role={previewRole} clientName={client.name} />}
    </div>
  );
}
