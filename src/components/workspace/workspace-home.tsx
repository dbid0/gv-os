"use client";

import Link from "next/link";

import {
  TeamspaceIcon,
  type TeamspaceLike,
} from "@/components/workspace/teamspace-icon";
import { findNodeByTitle, type PageNode } from "@/lib/workspace/tree";

/**
 * The teamspace Home — a faithful recreation of the "Global Ventures
 * Onboarding" Notion dashboard, rendered as the derived landing that opens
 * whenever a workspace is viewed with no `?page=`. Nothing here is stored: the
 * heading is the teamspace, and every link resolves against THAT teamspace's own
 * page tree by title, so the agency Home and each client's Home point at their
 * own pages for free — and Home can never be renamed or deleted.
 *
 * Layout matches Notion: a big icon + name title, then a two-column body — a
 * "⚡ Dashboard" callout of link rows on the left, a "# To-Do List" callout with
 * a status table on the right. Everything below is config-driven (the arrays at
 * the top), so tweaking the link list is a one-line edit.
 */

/** How a Home link resolves — to a workspace page, or to the Marketing area. */
type LinkKind = "page" | "marketing";

interface HomeLink {
  title: string;
  emoji: string;
  kind: LinkKind;
}

/** The "⚡ Dashboard" callout — each row resolves to a page by title. */
const DASHBOARD_ITEMS: HomeLink[] = [
  { title: "Global Ventures Timeline", emoji: "🗓️", kind: "page" },
  { title: "Onboarding", emoji: "🚀", kind: "page" },
  { title: "Custom GPT's", emoji: "🤖", kind: "page" },
  { title: "Coaching Protocol", emoji: "🎯", kind: "page" },
  { title: "Resources", emoji: "🧰", kind: "page" },
];

interface TodoItem {
  /** Leading static text — the whole label when there is no linked sheet. */
  label: string;
  /** When set, this sheet name is appended after `label` as a resolvable link. */
  linkTitle?: string;
}

/** The "# To-Do List" callout — the three "Fill out …" rows link their sheet. */
const TODO_ITEMS: TodoItem[] = [
  { label: "Fill out ", linkTitle: "Software Logins" },
  { label: "Fill out ", linkTitle: "Brand Sheets" },
  { label: "Fill out ", linkTitle: "Client Roadmap" },
  { label: "Film VSL" },
  { label: "Film pre-call assets" },
  { label: "Film course modules" },
  { label: "Finalize Offer" },
  { label: "Set up launch call" },
];

/** The Marketing/Content area — where the Content pages live, off the tree. */
const MARKETING_HREF = "/marketing";

/** What a resolved link points at, and how it should navigate. */
type LinkTarget =
  { mode: "select"; id: string; href: string } | { mode: "link"; href: string };

/**
 * Resolve a Home link to a concrete target within THIS teamspace's tree.
 *
 * A `page` link becomes a client-side `?page=<id>` select when its title is
 * found; if it isn't, it falls back to the base workspace route (harmless — it
 * just re-lands on Home). A `marketing` link prefers a real page if the tree
 * happens to have one, else it navigates to the Marketing area.
 */
function resolveLink(item: HomeLink, pages: PageNode[], basePath: string): LinkTarget {
  const node = findNodeByTitle(pages, item.title);
  if (node) return { mode: "select", id: node.id, href: `${basePath}?page=${node.id}` };
  if (item.kind === "marketing") return { mode: "link", href: MARKETING_HREF };
  return { mode: "link", href: basePath };
}

export function WorkspaceHome({
  teamspace,
  pages,
  basePath,
  onSelect,
}: {
  teamspace: TeamspaceLike;
  /** The teamspace's page forest — links resolve by title against the whole tree. */
  pages: PageNode[];
  /** The workspace route path (e.g. /clients/foo/workspace) for `?page=` links. */
  basePath: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 pt-[72px] pb-24 sm:px-12">
          {/* Notion page title: the teamspace icon + name. */}
          <div className="flex items-center gap-3">
            <TeamspaceIcon ts={teamspace} size={44} />
            <h1 className="text-foreground text-3xl font-bold tracking-[-0.02em]">
              {teamspace.name}
            </h1>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* LEFT — the ⚡ Dashboard callout of page links. */}
            <Callout>
              <CalloutHeader className="text-brand">
                <span aria-hidden>⚡</span>
                <span>Dashboard</span>
              </CalloutHeader>
              <div className="mt-2 flex flex-col">
                {DASHBOARD_ITEMS.map((item) => (
                  <LinkRow
                    key={item.title}
                    emoji={item.emoji}
                    label={item.title}
                    target={resolveLink(item, pages, basePath)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </Callout>

            {/* RIGHT — the # To-Do List callout with a status table. */}
            <Callout>
              <CalloutHeader className="text-foreground">
                <span className="text-faint" aria-hidden>
                  #
                </span>
                <span>To-Do List</span>
              </CalloutHeader>
              <TodoTable pages={pages} basePath={basePath} onSelect={onSelect} />
            </Callout>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A Notion-style callout card: rounded, faint border, quiet tinted surface. */
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border/60 bg-secondary/30 rounded-xl border p-5">
      {children}
    </div>
  );
}

/** The bold, coloured header row at the top of a callout. */
function CalloutHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 text-[0.95rem] font-bold ${className}`}>
      {children}
    </div>
  );
}

/** One clickable link row: emoji + title, the whole row a link with a hover wash. */
function LinkRow({
  emoji,
  label,
  target,
  onSelect,
}: {
  emoji: string;
  label: string;
  target: LinkTarget;
  onSelect: (id: string) => void;
}) {
  const className =
    "group text-foreground hover:bg-foreground/[0.06] -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.95rem] transition-colors";
  const inner = (
    <>
      <span className="w-5 text-center text-base leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="truncate">{label}</span>
    </>
  );

  // A found page navigates client-side on a plain click (modified clicks keep
  // the real link — new tab, etc.). Everything else is a normal in-app link.
  if (target.mode === "select") {
    return (
      <a
        href={target.href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onSelect(target.id);
        }}
        className={className}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={target.href} className={className}>
      {inner}
    </Link>
  );
}

/** The To-Do table: Task + a "Not started" status pill on every row. */
function TodoTable({
  pages,
  basePath,
  onSelect,
}: {
  pages: PageNode[];
  basePath: string;
  onSelect: (id: string) => void;
}) {
  return (
    <table className="mt-4 w-full border-collapse text-sm">
      <thead>
        <tr className="border-border/60 border-b text-left">
          <th className="text-muted-foreground pr-4 pb-2 font-medium">Task</th>
          <th className="text-muted-foreground pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {TODO_ITEMS.map((item) => (
          <tr
            key={item.label + (item.linkTitle ?? "")}
            className="border-border/40 border-b last:border-0"
          >
            <td className="text-foreground py-2.5 pr-4">
              {item.label}
              {item.linkTitle ? (
                <TodoSheetLink
                  title={item.linkTitle}
                  pages={pages}
                  basePath={basePath}
                  onSelect={onSelect}
                />
              ) : null}
            </td>
            <td className="py-2.5">
              <StatusPill />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A sheet name inside a To-Do row, linked to its page when the tree has one. */
function TodoSheetLink({
  title,
  pages,
  basePath,
  onSelect,
}: {
  title: string;
  pages: PageNode[];
  basePath: string;
  onSelect: (id: string) => void;
}) {
  const node = findNodeByTitle(pages, title);
  const className =
    "text-foreground decoration-border/70 hover:text-brand hover:decoration-brand/60 font-medium underline decoration-1 underline-offset-2 transition-colors";

  if (node) {
    return (
      <a
        href={`${basePath}?page=${node.id}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onSelect(node.id);
        }}
        className={className}
      >
        {title}
      </a>
    );
  }
  // Not in this teamspace's tree — still render the name, pointed at the base
  // route so it stays harmless rather than a dead link.
  return (
    <Link href={basePath} className={className}>
      {title}
    </Link>
  );
}

/** Notion's "Not started" status chip — a muted grey pill with a dot. */
function StatusPill() {
  return (
    <span className="bg-secondary/70 text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <span className="bg-faint size-1.5 rounded-full" aria-hidden />
      Not started
    </span>
  );
}
