"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight, FileText } from "lucide-react";

import type { ShareView } from "@/lib/workspace/shares";

/**
 * The PUBLIC, read-only render of a shared Workspace page.
 *
 * It lives outside the app shell — no sidebar, no nav, no auth chrome — and
 * forces the GV dark charcoal via a `.dark` wrapper so a shared link always
 * looks like the real document regardless of the visitor's system theme. The
 * body is the same BlockNote engine as the editor, driven read-only, in a clean
 * centered ~720px column. Sub-page links (when the share includes children)
 * navigate WITHIN the shared subtree under the same token via `?p=<childId>`;
 * the server re-checks every id, so a link can never point outside the share.
 */

const BlockReader = dynamic(
  () => import("@/components/workspace/block-reader").then((m) => m.BlockReader),
  {
    ssr: false,
    loading: () => (
      <p className="text-faint/50 py-1 text-[1rem] leading-[1.5]">Loading…</p>
    ),
  },
);

export function SharePageView({ view, token }: { view: ShareView; token: string }) {
  const { page, breadcrumb, children, includeChildren } = view;
  // The crumb up to (but not including) the current page — the current page is
  // shown as plain text on the end.
  const trail = breadcrumb.slice(0, -1);

  const hrefFor = (id: string) =>
    id === breadcrumb[0]?.id ? `/share/${token}` : `/share/${token}?p=${id}`;

  return (
    <div className="dark bg-background text-foreground flex min-h-screen flex-col">
      {/* A subtle top strip — page title + a "View only" pill. Notion-clean. */}
      <header className="border-border/50 text-faint flex h-11 shrink-0 items-center gap-2 border-b px-4 text-[0.8125rem]">
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
          {trail.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <Link
                href={hrefFor(crumb.id)}
                className="hover:text-foreground flex max-w-[12rem] items-center gap-1 truncate rounded px-1 py-0.5 transition-colors"
              >
                {crumb.icon && <span className="text-[0.75rem]">{crumb.icon}</span>}
                <span className="truncate">{crumb.title || "Untitled"}</span>
              </Link>
              <span className="text-faint/60">/</span>
            </span>
          ))}
          <span className="text-muted-foreground flex max-w-[16rem] items-center gap-1 truncate px-1 py-0.5">
            {page.icon && <span className="text-[0.75rem]">{page.icon}</span>}
            <span className="truncate">{page.title || "Untitled"}</span>
          </span>
        </nav>
        <span className="border-border/70 text-faint shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide">
          View only
        </span>
      </header>

      {/* The document — a centered column with a big top gutter, mirroring the
          in-app page pane so a shared page reads identically. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pt-[80px] pb-24 sm:px-12">
          {page.icon && (
            <div className="mb-1 text-[78px] leading-none">{page.icon}</div>
          )}

          <h1 className="text-foreground text-[2.5rem] leading-[1.2] font-bold tracking-[-0.02em]">
            {page.title || "Untitled"}
          </h1>

          <div className="mt-2">
            <BlockReader content={page.content} />
          </div>

          {includeChildren && children.length > 0 && (
            <div className="border-border/50 mt-8 border-t pt-3">
              {children.map((sp) => (
                <Link
                  key={sp.id}
                  href={`/share/${token}?p=${sp.id}`}
                  className="group hover:bg-secondary/40 -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="grid size-5 shrink-0 place-items-center text-[0.95rem]">
                    {sp.icon ?? <FileText className="text-faint size-4" />}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate text-[0.95rem] font-medium underline-offset-2 group-hover:underline">
                    {sp.title || "Untitled"}
                  </span>
                  <ChevronRight className="text-faint size-4 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* A small, unobtrusive attribution footer. */}
      <footer className="text-faint/70 flex shrink-0 items-center justify-center gap-1.5 py-5 text-[0.75rem]">
        Shared via Global Ventures
      </footer>
    </div>
  );
}
