"use client";

import "@blocknote/mantine/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { en, type Dictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView, type Theme } from "@blocknote/mantine";

/**
 * The Workspace page BODY — a Notion-style WYSIWYG block editor (BlockNote).
 *
 * This replaces the old raw-markdown textarea: the user never sees `##`/`**`/`-`,
 * they type and it renders live, and "/" opens a slash menu of block types. The
 * editor is ALWAYS editable — Notion has no read/edit toggle — so there is one
 * always-on instance, not a click-to-edit split.
 *
 * It is client-only (ProseMirror + Mantine touch the DOM), so page-editor.tsx
 * loads it through `next/dynamic({ ssr: false })`. The pane is remounted per
 * page (keyed by id upstream), which is why initial content is read once at
 * mount and never has to react to prop changes.
 *
 * STORAGE: the body persists as a BlockNote document serialised to a JSON string
 * in `workspace_pages.content`. On load, JSON is used directly; anything that is
 * not a BlockNote document (legacy markdown from the previous renderer, or a
 * pasted note) is imported once via `tryParseMarkdownToBlocks`, so nothing that
 * was ever written is lost. On change, a debounced autosave (~800ms) serialises
 * the document and hands the JSON up to the existing `updatePage` action.
 */

const PLACEHOLDER = "Write something, or press '/' for commands";

/**
 * The default English dictionary with Notion's empty-page prompt. `default`
 * shows on any focused empty block; `emptyDocument` shows on a brand-new page
 * before it is even focused.
 */
const dictionary: Dictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    default: PLACEHOLDER,
    emptyDocument: PLACEHOLDER,
  },
};

/**
 * The GV charcoal theme. Every value is a CSS variable, so the editor tracks the
 * app's light/dark tokens automatically, and BlockNote applies these INLINE on
 * its root element — which beats its own default stylesheet, so the editor reads
 * as our dark Notion page rather than default BlockNote. Editor background is
 * transparent so the page's charcoal (and its light bloom) shows through, the
 * same as the reading skin.
 */
const gvTheme: Theme = {
  colors: {
    editor: { text: "var(--foreground)", background: "transparent" },
    menu: { text: "var(--foreground)", background: "var(--popover)" },
    tooltip: { text: "var(--foreground)", background: "var(--secondary)" },
    hovered: { text: "var(--foreground)", background: "var(--secondary)" },
    selected: { text: "var(--foreground)", background: "var(--accent)" },
    disabled: { text: "var(--faint)", background: "var(--muted)" },
    shadow: "var(--border-strong)",
    border: "var(--border)",
    sideMenu: "var(--faint)",
  },
  fontFamily: "inherit",
};

/**
 * Decide how a stored `content` string opens. A BlockNote document is a JSON
 * array of typed block objects; anything else (legacy markdown, a pasted note,
 * or empty) is imported as markdown after mount.
 */
function readStored(raw: string | null): {
  initialBlocks: PartialBlock[] | undefined;
  legacyMarkdown: string | null;
} {
  if (!raw || raw.trim() === "") {
    return { initialBlocks: undefined, legacyMarkdown: null };
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const isBlockDoc =
          parsed.length > 0 &&
          parsed.every((b) => b !== null && typeof b === "object" && "type" in b);
        if (isBlockDoc) {
          return { initialBlocks: parsed as PartialBlock[], legacyMarkdown: null };
        }
        // Valid JSON, but not a BlockNote document (or an empty array): open blank.
        return { initialBlocks: undefined, legacyMarkdown: null };
      }
    } catch {
      // Not JSON — fall through and treat it as markdown.
    }
  }
  return { initialBlocks: undefined, legacyMarkdown: raw };
}

export function BlockEditor({
  initialContent,
  onChange,
  onReady,
}: {
  /** The stored `content`: BlockNote JSON, legacy markdown, or null/empty. */
  initialContent: string | null;
  /** Debounced: called with the serialised document JSON to persist. */
  onChange: (contentJson: string) => void;
  /** Handed a focus() fn once mounted, so title-Enter can jump into the body. */
  onReady?: (focus: () => void) => void;
}) {
  // Read the stored body once, at mount. The pane is keyed per page upstream, so
  // a page switch is a remount with fresh initial content — this never has to
  // react to a changing `initialContent` prop.
  const [{ initialBlocks, legacyMarkdown }] = useState(() =>
    readStored(initialContent),
  );

  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
    dictionary,
  });

  // Keep the latest callbacks reachable from async work (the debounced save and
  // focus) without resubscribing. Synced in an effect so nothing writes a ref
  // during render.
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
  });

  // Autosave state. `ready` gates saves until initial/legacy content is settled,
  // so opening a page never writes; `baseline` is the last-known serialised doc,
  // so an idle open or the one-time migration doesn't count as an edit.
  const readyRef = useRef(false);
  const baselineRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const json = pendingRef.current;
      pendingRef.current = null;
      onChangeRef.current(json);
    }
  }, []);

  // Settle initial content, then mark ready. Legacy markdown (or a pasted note)
  // is imported once here; the resulting document becomes the baseline so the
  // migration itself never triggers a save — the page only rewrites in the new
  // JSON format once the user actually edits it.
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      baselineRef.current = JSON.stringify(editor.document);
      readyRef.current = true;
      onReadyRef.current?.(() => editor.focus());
    };
    if (legacyMarkdown) {
      Promise.resolve(editor.tryParseMarkdownToBlocks(legacyMarkdown))
        .then((blocks) => {
          if (cancelled) return;
          if (blocks && blocks.length > 0) {
            editor.replaceBlocks(editor.document, blocks);
          }
          finish();
        })
        .catch(finish);
    } else {
      finish();
    }
    return () => {
      cancelled = true;
    };
  }, [editor, legacyMarkdown]);

  // Flush a pending save when the page is switched away or unmounted — so a
  // debounced edit is never dropped mid-flight.
  useEffect(() => {
    return () => flush();
  }, [flush]);

  const handleChange = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(editor.document);
    if (json === baselineRef.current) return;
    baselineRef.current = json;
    pendingRef.current = json;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next !== null) onChangeRef.current(next);
    }, 800);
  }, [editor]);

  return (
    <div className="gv-block-editor">
      <BlockNoteView editor={editor} theme={gvTheme} onChange={handleChange} />
    </div>
  );
}
