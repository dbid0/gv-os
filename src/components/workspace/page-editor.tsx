"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, Share, Star } from "lucide-react";

import { EmojiPicker } from "@/components/workspace/emoji-picker";
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
  ancestors,
  saving,
  autoFocusTitle,
  onSave,
  onDraftChange,
  onSelect,
}: {
  page: EditablePage;
  teamspaceName: string;
  /** Where the root (teamspace) crumb links — the client page, or /clients. */
  teamspaceHref: string;
  /** Parent pages, teamspace-nearest first, excluding this page. */
  ancestors: Crumb[];
  saving: boolean;
  autoFocusTitle: boolean;
  onSave: (patch: { title?: string; icon?: string | null; content?: string }) => void;
  onDraftChange: (patch: { title?: string; icon?: string | null }) => void;
  onSelect: (id: string) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [starred, setStarred] = useState(false);

  const titleRef = useAutoResize(title);
  // Set once the block editor mounts; lets Enter in the title jump into the body.
  const focusBodyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (autoFocusTitle && titleRef.current) {
      const el = titleRef.current;
      el.focus();
      el.select();
    }
    // Only on first mount for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitTitle = () => {
    const next = title.trim() || "Untitled";
    if (next !== page.title) onSave({ title: next });
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
          <button
            type="button"
            aria-label="Page options"
            className="hover:bg-secondary/60 hover:text-foreground grid size-7 place-items-center rounded-md transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </button>
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
              onChange={(contentJson) => onSave({ content: contentJson })}
              onReady={(focus) => {
                focusBodyRef.current = focus;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
