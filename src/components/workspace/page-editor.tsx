"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Copy,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Share,
  Star,
  Trash2,
} from "lucide-react";

import { EmojiPicker } from "@/components/workspace/emoji-picker";
import { ShareDialog } from "@/components/workspace/share-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * The body is a Notion-style WYSIWYG editor (BlockNote). It is client-only —
 * ProseMirror + Mantine touch the DOM — so it is loaded with `ssr: false` to
 * keep it out of the RSC/server render entirely (no hydration mismatch). The
 * lightweight fallback holds the column height and shows Notion's placeholder
 * until the editor chunk lands.
 */
const BlockEditor = dynamic(
  () => import("@/components/workspace/block-editor").then((m) => m.BlockEditor),
  {
    ssr: false,
    loading: () => (
      <p className="text-faint/50 py-1 text-[1rem] leading-[1.5]">
        Write something, or press &apos;/&apos; for commands
      </p>
    ),
  },
);

export interface EditablePage {
  id: string;
  title: string;
  icon: string | null;
  content: string | null;
  updatedAt?: string;
}

export interface Crumb {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * The page pane, styled to be indistinguishable from a Notion document.
 *
 * FLAT and borderless: no cards, no panel outlines. A muted breadcrumb bar is
 * pinned at the top; the body sits in a centered ~720px column with a big top
 * gutter, a large emoji icon, and a 40px title. The body is a Notion-style
 * WYSIWYG block editor (BlockNote) that is ALWAYS editable — you click anywhere
 * and type, you never see raw markdown, and "/" opens the slash menu. There is
 * no read/edit toggle. Title and icon autosave on blur; the body autosaves on a
 * debounce as you type. The pane is REMOUNTED per page (keyed by id upstream),
 * so switching pages always starts from that page's saved state with no stale
 * draft bleeding.
 */

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

/** "Edited just now / 3h ago / Aug 29" — the Notion header chip. */
function editedLabel(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Edited just now";
  if (mins < 60) return `Edited ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Edited ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `Edited ${days}d ago`;
  return `Edited ${new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function PageEditor({
  page,
  teamspaceName,
  teamspaceHref,
  clientId,
  ancestors,
  subpages,
  saving,
  autoFocusTitle,
  focusNonce,
  basePath,
  resolvePageId,
  isHome = false,
  onSave,
  onDraftChange,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  page: EditablePage;
  teamspaceName: string;
  /** Where the root (teamspace) crumb links — the client page, or /clients. */
  teamspaceHref: string;
  /** The teamspace (null = agency), for any embedded To-Do database block. */
  clientId: string | null;
  /** Parent pages, teamspace-nearest first, excluding this page. */
  ancestors: Crumb[];
  /** This page's direct children, rendered as clickable sub-page links. */
  subpages: Crumb[];
  saving: boolean;
  autoFocusTitle: boolean;
  /** Bumped by the parent to re-focus the title (a rename on an open page). */
  focusNonce: number;
  /** The workspace route path (e.g. /clients/foo/workspace) for `?page=` links. */
  basePath: string;
  /** Title → page id in this teamspace, for the body's internal + To-Do links. */
  resolvePageId: (title: string) => string | null;
  /**
   * This is the teamspace Home. It is a NORMAL, fully-featured page — the same
   * editable title, Share, ••• menu (Rename / Duplicate / Copy link), and star
   * as any page — that also happens to be the teamspace's main/landing page
   * (pinned as the "🏠 Home" row, the default when there's no `?page=`). The one
   * difference: it is NOT deletable, so "Delete" is dropped from its menu — a
   * teamspace always keeps its home.
   */
  isHome?: boolean;
  onSave: (patch: { title?: string; icon?: string | null; content?: string }) => void;
  onDraftChange: (patch: { title?: string; icon?: string | null }) => void;
  onSelect: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(page.title);
  const [starred, setStarred] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const titleRef = useAutoResize(title);
  // Set once the block editor mounts; lets Enter in the title jump into the body.
  const focusBodyRef = useRef<(() => void) | null>(null);

  // Focus the title and select all its text, DEFERRED to the next frame. When
  // Rename is chosen from a menu, base-ui returns focus to the menu's trigger in
  // a microtask as it closes; a synchronous focus here would be immediately
  // stolen back. requestAnimationFrame runs after that microtask, so the title
  // reliably keeps focus and the user can retype straight away — from both the
  // header ••• and a tree-row rename (which re-mounts/re-focuses this pane).
  const focusTitle = () => {
    requestAnimationFrame(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  };

  useEffect(() => {
    if (autoFocusTitle) focusTitle();
    // Only on first mount for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-focus the title when the parent asks (a "Rename" on an already-open
  // page, where the mount effect above has already run). The first run is the
  // mount and is skipped, so a plain page switch never grabs the caret.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (autoFocusTitle) focusTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const commitTitle = () => {
    const next = title.trim() || "Untitled";
    if (next !== page.title) onSave({ title: next });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${basePath}?page=${page.id}`;
    const ok = await copyText(url);
    toast(
      ok
        ? { tone: "success", title: "Link copied" }
        : { tone: "error", title: "Couldn't copy the link", detail: url },
    );
  };

  const edited = editedLabel(page.updatedAt);

  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      {/* Breadcrumb bar — muted, pinned top-left; header chrome on the right. */}
      <div className="text-faint flex h-11 shrink-0 items-center gap-1 px-4 text-[0.8125rem]">
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
          <Link
            href={teamspaceHref}
            className="hover:text-foreground shrink-0 rounded px-1 py-0.5 transition-colors"
          >
            {teamspaceName}
          </Link>
          {ancestors.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <span className="text-faint/60">/</span>
              <button
                type="button"
                onClick={() => onSelect(crumb.id)}
                className="hover:text-foreground flex max-w-[12rem] items-center gap-1 truncate rounded px-1 py-0.5 transition-colors"
              >
                {crumb.icon && <span className="text-[0.75rem]">{crumb.icon}</span>}
                <span className="truncate">{crumb.title}</span>
              </button>
            </span>
          ))}
          <span className="text-faint/60">/</span>
          <span className="text-muted-foreground flex max-w-[14rem] items-center gap-1 truncate px-1 py-0.5">
            {page.icon && <span className="text-[0.75rem]">{page.icon}</span>}
            <span className="truncate">{title.trim() || "Untitled"}</span>
          </span>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "text-faint mr-1 hidden text-[0.8125rem] transition-opacity sm:inline",
              saving && "opacity-60",
            )}
          >
            {saving ? "Saving…" : edited}
          </span>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="hover:bg-secondary/60 hover:text-foreground hidden rounded-md px-2 py-1 text-[0.8125rem] transition-colors sm:inline-flex"
          >
            <Share className="mr-1 size-3.5" /> Share
          </button>
          <button
            type="button"
            onClick={() => setStarred((v) => !v)}
            aria-pressed={starred}
            aria-label={starred ? "Remove from favorites" : "Add to favorites"}
            className="hover:bg-secondary/60 hover:text-foreground grid size-7 place-items-center rounded-md transition-colors"
          >
            <Star className={cn("size-4", starred && "fill-current text-amber-400")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Page options"
              className="hover:bg-secondary/60 hover:text-foreground grid size-7 place-items-center rounded-md transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={focusTitle}>
                <Pencil className="size-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyLink}>
                <Link2 className="size-4" /> Copy link
              </DropdownMenuItem>
              {/* Home is the teamspace's landing page — it can't be deleted, so
                  it keeps everything above but drops Delete. */}
              {!isHome && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* The document — a centered column with a big top gutter. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pt-[100px] pb-40 sm:px-12">
          <div className="-ml-2">
            <EmojiPicker
              size={78}
              value={page.icon}
              onSelect={(icon) => {
                onDraftChange({ icon });
                onSave({ icon });
              }}
            />
          </div>

          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              onDraftChange({ title: e.target.value });
            }}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
                focusBodyRef.current?.();
              }
            }}
            rows={1}
            spellCheck={false}
            placeholder="Untitled"
            className="placeholder:text-faint/60 text-foreground mt-1 w-full resize-none bg-transparent text-[2.5rem] leading-[1.2] font-bold tracking-[-0.02em] outline-none"
          />

          <div className="mt-2">
            <BlockEditor
              initialContent={page.content}
              pageId={page.id}
              todoClientId={clientId}
              basePath={basePath}
              onSelectPage={onSelect}
              resolvePageId={resolvePageId}
              onChange={(contentJson) => onSave({ content: contentJson })}
              onReady={(focus) => {
                focusBodyRef.current = focus;
              }}
            />
          </div>

          {subpages.length > 0 && (
            <div className="border-border/50 mt-8 border-t pt-3">
              {subpages.map((sp) => (
                <a
                  key={sp.id}
                  href={`${basePath}?page=${sp.id}`}
                  onClick={(e) => {
                    // Plain click switches page instantly, client-side; modified
                    // clicks (new tab, etc.) keep the real link behaviour.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    onSelect(sp.id);
                  }}
                  className="group hover:bg-secondary/40 -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="grid size-5 shrink-0 place-items-center text-[0.95rem]">
                    {sp.icon ?? <FileText className="text-faint size-4" />}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate text-[0.95rem] font-medium underline-offset-2 group-hover:underline">
                    {sp.title || "Untitled"}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        pageId={page.id}
        inAppUrl={`${
          typeof window !== "undefined" ? window.location.origin : ""
        }${basePath}?page=${page.id}`}
      />
    </div>
  );
}
