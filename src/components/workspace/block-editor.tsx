"use client";

import "@blocknote/mantine/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { en, type Dictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView, type Theme } from "@blocknote/mantine";

import { useToast } from "@/components/ui/toast";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/storage/constants";
import { colorizeCallouts } from "@/lib/workspace/colorize-callouts";

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
  pageId,
  onChange,
  onReady,
}: {
  /** The stored `content`: BlockNote JSON, legacy markdown, or null/empty. */
  initialContent: string | null;
  /** The page this body belongs to — namespaces uploaded attachments. */
  pageId?: string;
  /** Debounced: called with the serialised document JSON to persist. */
  onChange: (contentJson: string) => void;
  /** Handed a focus() fn once mounted, so title-Enter can jump into the body. */
  onReady?: (focus: () => void) => void;
}) {
  const { toast } = useToast();

  // Read the stored body once, at mount. The pane is keyed per page upstream, so
  // a page switch is a remount with fresh initial content — this never has to
  // react to a changing `initialContent` prop. Colourise the JSON path here so
  // the editor's very first render (and its autosave baseline, captured below
  // from `editor.document`) already carries the callout colours — opening a page
  // never counts as an edit. The legacy-markdown path is colourised after parse.
  const [{ initialBlocks, legacyMarkdown }] = useState(() => {
    const stored = readStored(initialContent);
    return {
      ...stored,
      initialBlocks: stored.initialBlocks
        ? colorizeCallouts(stored.initialBlocks)
        : stored.initialBlocks,
    };
  });

  // Reachable from `uploadFile`'s async closure without re-creating the editor.
  const toastRef = useRef(toast);
  const pageIdRef = useRef(pageId);
  useEffect(() => {
    toastRef.current = toast;
    pageIdRef.current = pageId;
  });

  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
    dictionary,
    // Uploads an image / video / file picked from the computer to Supabase
    // Storage and returns the public URL BlockNote embeds in the block. A size
    // reject or server failure surfaces as an error toast; re-throwing lets
    // BlockNote clear the loading state on the block.
    uploadFile: async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toastRef.current({
          tone: "error",
          title: "File too large",
          detail: `The limit is ${MAX_UPLOAD_LABEL}.`,
        });
        throw new Error(`File exceeds the ${MAX_UPLOAD_LABEL} limit.`);
      }

      const form = new FormData();
      form.append("file", file);
      if (pageIdRef.current) form.append("pageId", pageIdRef.current);

      let res: Response;
      try {
        res = await fetch("/api/workspace/upload", { method: "POST", body: form });
      } catch {
        toastRef.current({
          tone: "error",
          title: "Upload failed",
          detail: "Couldn't reach the server. Check your connection.",
        });
        throw new Error("Upload request failed.");
      }

      if (!res.ok) {
        let detail = "Something went wrong uploading that file.";
        try {
          const body: unknown = await res.json();
          if (
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof (body as { error: unknown }).error === "string"
          ) {
            detail = (body as { error: string }).error;
          }
        } catch {
          // Non-JSON error body — keep the generic detail.
        }
        toastRef.current({ tone: "error", title: "Upload failed", detail });
        throw new Error(detail);
      }

      const data: unknown = await res.json();
      const url =
        data && typeof data === "object" && "url" in data
          ? (data as { url: unknown }).url
          : null;
      if (typeof url !== "string" || !url) {
        toastRef.current({ tone: "error", title: "Upload failed" });
        throw new Error("The upload returned no URL.");
      }
      return url;
    },
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
            // Colourise the freshly-parsed markdown before it becomes the
            // document, so the migration lands already-coloured and `finish()`
            // captures the coloured doc as the baseline (no spurious save).
            editor.replaceBlocks(editor.document, colorizeCallouts(blocks));
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
