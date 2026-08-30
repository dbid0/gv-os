"use client";

import { FileText } from "lucide-react";

import {
  TeamspaceIcon,
  type TeamspaceLike,
} from "@/components/workspace/teamspace-icon";
import { topLevelNodes, type PageNode } from "@/lib/workspace/tree";

/**
 * The teamspace Home — a derived landing that opens whenever a workspace is
 * viewed with no `?page=`. Nothing here is stored: the heading comes from the
 * teamspace and the cards are its top-level pages, so every teamspace (agency +
 * each client) gets a Home for free, and it can never be renamed or deleted.
 *
 * The look matches the flat, spacious Notion page pane: a big icon + name, a
 * muted one-liner, then a responsive grid of quiet cards that redirect into the
 * top-level pages — one card per root, each a real link that navigates
 * client-side on a plain click (and opens in a new tab on a modified click).
 */
export function WorkspaceHome({
  teamspace,
  pages,
  basePath,
  onSelect,
}: {
  teamspace: TeamspaceLike;
  /** The teamspace's page forest — only the roots become cards. */
  pages: PageNode[];
  /** The workspace route path (e.g. /clients/foo/workspace) for `?page=` links. */
  basePath: string;
  onSelect: (id: string) => void;
}) {
  const roots = topLevelNodes(pages);

  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-6 pt-[72px] pb-24 sm:px-12">
          <div className="flex items-center gap-3">
            <TeamspaceIcon ts={teamspace} size={44} />
            <h1 className="text-foreground text-3xl font-bold tracking-[-0.02em]">
              {teamspace.name}
            </h1>
          </div>
          <p className="text-muted-foreground mt-2 text-[0.95rem]">
            Everything for {teamspace.name} in one place.
          </p>

          {roots.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roots.map((node) => (
                <HomeCard
                  key={node.id}
                  node={node}
                  href={`${basePath}?page=${node.id}`}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mt-8 text-sm">
              No pages yet. Add one from the sidebar to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeCard({
  node,
  href,
  onSelect,
}: {
  node: PageNode;
  href: string;
  onSelect: (id: string) => void;
}) {
  const count = node.children.length;
  return (
    <a
      href={href}
      onClick={(e) => {
        // Plain click navigates instantly, client-side; modified clicks (new
        // tab, etc.) keep the real link behaviour.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelect(node.id);
      }}
      className="group border-border/60 bg-secondary/30 hover:bg-secondary/50 hover:border-border flex flex-col rounded-xl border p-4 transition-colors"
    >
      <span className="grid size-7 place-items-center text-2xl leading-none">
        {node.icon ?? <FileText className="text-faint size-6" />}
      </span>
      <span className="text-foreground mt-3 truncate text-[0.95rem] font-medium">
        {node.title || "Untitled"}
      </span>
      {count > 0 && (
        <span className="text-muted-foreground mt-0.5 text-xs">
          {count} sub-page{count === 1 ? "" : "s"}
        </span>
      )}
    </a>
  );
}
