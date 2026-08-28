"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, Eye, Pencil } from "lucide-react";

import { EmojiPicker } from "@/components/workspace/emoji-picker";
import { Markdown } from "@/components/workspace/markdown";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

export interface EditablePage {
  id: string;
  title: string;
  icon: string | null;
  content: string | null;
}

export interface Crumb {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * The right pane: one page, editable in place.
 *
 * Markdown-backed, with a clean Read ⇄ Edit toggle rather than a block editor —
 * the body is one document string. Title and icon edit inline and autosave on
 * blur; the body autosaves when you leave the editor or flip back to Read. It
 * is REMOUNTED per page (keyed by id upstream), so switching pages always
 * starts from that page's saved state with no stale draft bleeding across.
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

export function PageEditor({
  page,
  teamspaceName,
  ancestors,
  saving,
  initialEditing,
  autoFocusTitle,
  onSave,
  onDraftChange,
  onSelect,
}: {
  page: EditablePage;
  teamspaceName: string;
  /** Parent pages, teamspace-nearest first, excluding this page. */
  ancestors: Crumb[];
  saving: boolean;
  initialEditing: boolean;
  autoFocusTitle: boolean;
  onSave: (patch: { title?: string; icon?: string | null; content?: string }) => void;
  onDraftChange: (patch: { title?: string; icon?: string | null }) => void;
  onSelect: (id: string) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content ?? "");
  const [editing, setEditing] = useState(initialEditing);

  const titleRef = useAutoResize(title);
  const bodyRef = useAutoResize(content);

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
  const commitContent = () => {
    if (content !== (page.content ?? "")) onSave({ content });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      {/* Breadcrumb */}
      <div className="text-faint flex items-center gap-1 overflow-x-auto px-1 py-1 text-xs whitespace-nowrap">
        <span className="text-muted-foreground">{teamspaceName}</span>
        {ancestors.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="size-3 shrink-0" />
            <button
              type="button"
              onClick={() => onSelect(crumb.id)}
              className="hover:text-foreground max-w-[12rem] truncate transition-colors"
            >
              {crumb.icon ? `${crumb.icon} ` : ""}
              {crumb.title}
            </button>
          </span>
        ))}
        <ChevronRight className="size-3 shrink-0" />
        <span className="text-muted-foreground max-w-[14rem] truncate">
          {page.icon ? `${page.icon} ` : ""}
          {title.trim() || "Untitled"}
        </span>
      </div>

      {/* Toolbar */}
      <div className="mt-1 mb-2 flex items-center justify-between px-1">
        <span
          className={cn(
            "text-faint text-xs transition-opacity",
            saving ? "opacity-100" : "opacity-0",
          )}
        >
          Saving…
        </span>
        <Segmented
          ariaLabel="View mode"
          value={editing ? "edit" : "read"}
          onChange={(v) => {
            if (v === "read") commitContent();
            setEditing(v === "edit");
          }}
          segments={[
            { value: "read", label: "Read", icon: Eye },
            { value: "edit", label: "Edit", icon: Pencil },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-24">
        {/* Icon + title */}
        <div className="-ml-1 pt-2">
          <EmojiPicker
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
          rows={1}
          spellCheck={false}
          placeholder="Untitled"
          className="placeholder:text-faint mt-1 w-full resize-none bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none sm:text-4xl"
        />

        {/* Body */}
        <div className="mt-4">
          {editing ? (
            <textarea
              ref={bodyRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={commitContent}
              spellCheck={false}
              placeholder={
                "Write in markdown…\n\n# Heading\n**bold**, *italic*, `code`\n- a bullet\n1. a step\n- [ ] a to-do\n> a quote"
              }
              className="placeholder:text-faint/70 min-h-[16rem] w-full resize-none bg-transparent font-mono text-[0.9rem] leading-7 outline-none"
            />
          ) : content.trim() === "" ? (
            <div className="text-faint py-10 text-sm">
              <p>This page is empty.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3.5" /> Start writing
              </Button>
            </div>
          ) : (
            <Markdown content={content} />
          )}
        </div>
      </div>
    </div>
  );
}
