"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { PageIcon } from "@/components/workspace/page-icon";
import { TeamspaceIcon } from "@/components/workspace/teamspace-icon";
import type { PageNode } from "@/lib/workspace/tree";
import { cn } from "@/lib/utils";

/** One other teamspace, as the agency sidebar lists it. */
export interface OtherTeamspace {
  clientId: string | null;
  slug: string | null;
  name: string;
  accent: string;
  pages: PageNode[];
}

/**
 * Every OTHER offer's docs, listed under the agency's own in one sidebar.
 *
 * Daniel: "if I go to Clients and click Agency Workspace, [I want] all of the
 * notations for all the offers… I just want to be able to see all of them on
 * the sidebar." Notion shows every teamspace at once; this does the same.
 *
 * These sections are for FINDING a page, not editing in place: a client's pages
 * live in that client's own workspace (its own route, its own brand skin), so a
 * row links there rather than pulling the page into the agency editor. Keeping
 * editing in one place is what stops a page being saved against the wrong
 * teamspace.
 */
export function OtherTeamspaces({ teamspaces }: { teamspaces: OtherTeamspace[] }) {
  if (teamspaces.length === 0) return null;
  return (
    <div className="border-border/60 mt-4 space-y-0.5 border-t pt-3">
      <p className="text-faint px-2 pb-1 text-[0.6875rem] font-medium tracking-wider uppercase">
        Other offers
      </p>
      {teamspaces.map((ts) => (
        <TeamspaceSection key={ts.slug ?? ts.name} ts={ts} />
      ))}
    </div>
  );
}

function TeamspaceSection({ ts }: { ts: OtherTeamspace }) {
  const [open, setOpen] = useState(false);
  const base = ts.slug ? `/clients/${ts.slug}/workspace` : "/clients/workspace";
  const count = countPages(ts.pages);

  return (
    <div>
      <div className="group/ts hover:bg-secondary/40 flex items-center gap-1 rounded-md px-1 py-1 transition-colors">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-faint hover:text-foreground grid size-5 shrink-0 place-items-center rounded"
          aria-label={open ? `Collapse ${ts.name}` : `Expand ${ts.name}`}
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <Link
          href={base}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left"
          title={`Open ${ts.name}`}
        >
          <TeamspaceIcon ts={ts} size={18} />
          <span className="text-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
            {ts.name}
          </span>
          <span className="text-faint shrink-0 text-[0.6875rem] tabular-nums">
            {count}
          </span>
        </Link>
      </div>

      {open && (
        <div className="mt-0.5">
          {ts.pages.length === 0 ? (
            <p className="text-faint py-1 pl-8 text-[0.8125rem]">No pages yet.</p>
          ) : (
            ts.pages.map((p) => <Row key={p.id} node={p} base={base} depth={0} />)
          )}
        </div>
      )}
    </div>
  );
}

/** A page row — links into that client's own workspace at this page. */
function Row({ node, base, depth }: { node: PageNode; base: string; depth: number }) {
  const [open, setOpen] = useState(false);
  const kids = node.children ?? [];
  return (
    <div>
      <div
        className="hover:bg-secondary/40 flex items-center gap-0.5 rounded-md pr-1 transition-colors"
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-faint hover:text-foreground grid size-5 shrink-0 place-items-center rounded"
            aria-label={open ? `Collapse ${node.title}` : `Expand ${node.title}`}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}
        <Link
          href={`${base}?page=${node.id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <span className="grid size-4 shrink-0 place-items-center text-[0.8125rem]">
            <PageIcon icon={node.icon} />
          </span>
          <span
            className={cn(
              "text-muted-foreground min-w-0 flex-1 truncate text-[0.8125rem]",
            )}
          >
            {node.title}
          </span>
        </Link>
      </div>
      {open &&
        kids.map((c) => <Row key={c.id} node={c} base={base} depth={depth + 1} />)}
    </div>
  );
}

function countPages(nodes: PageNode[]): number {
  return nodes.reduce((n, p) => n + 1 + countPages(p.children ?? []), 0);
}
