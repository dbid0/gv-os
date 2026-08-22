import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TabKeepWarm } from "@/components/shell/tab-keep-warm";
import { TopClock } from "@/components/shell/top-clock";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
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

  const skin = {
    "--brand": client.accent,
    "--brand-soft": `color-mix(in oklab, ${client.accent} 16%, var(--background))`,
  } as CSSProperties;

  return (
    <div style={skin} className="flex h-dvh flex-col overflow-hidden">
      <header className="glass sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Admin
        </Link>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-md border text-xs font-bold"
          style={{
            color: client.accent,
            borderColor: `${client.accent}55`,
            background: `${client.accent}14`,
          }}
        >
          {clientInitial(client.name)}
        </span>
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
        <WorkspaceNav slug={slug} />
      </div>
      <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      <TabKeepWarm />
    </div>
  );
}
