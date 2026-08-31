"use client";

import "@blocknote/mantine/style.css";

import { useEffect, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView, type Theme } from "@blocknote/mantine";

import {
  workspaceSchema,
  type WorkspacePartialBlock,
} from "@/components/workspace/todo-database-block";
import { colorizeCallouts } from "@/lib/workspace/colorize-callouts";

/**
 * The Workspace page body, RENDERED READ-ONLY — the public share view.
 *
 * It reuses the exact same BlockNote engine and charcoal theme as the in-app
 * editor (block-editor.tsx), driven with `editable={false}`, so a shared page
 * looks pixel-identical to the real document — just with no cursor, no slash
 * menu, no drag handles, and no autosave. Deliberately self-contained: it
 * carries NONE of the editor's mutation machinery (no `onChange`, no
 * `uploadFile`, no server actions), so the public route physically cannot reach
 * `updatePage`. Read-only means read-only.
 *
 * Client-only, like the editor — ProseMirror touches the DOM — so it is loaded
 * through `next/dynamic({ ssr: false })` by its caller.
 */

/** Matches block-editor.tsx's theme so the reader and the editor are one skin. */
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
 * Decide how a stored `content` string opens — the read-only twin of the
 * editor's parser. A BlockNote document is a JSON array of typed blocks;
 * anything else (legacy markdown, a pasted note) is imported as markdown after
 * mount so nothing ever written is lost on a shared page.
 */
function readStored(raw: string | null): {
  initialBlocks: WorkspacePartialBlock[] | undefined;
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
          return {
            initialBlocks: parsed as WorkspacePartialBlock[],
            legacyMarkdown: null,
          };
        }
        return { initialBlocks: undefined, legacyMarkdown: null };
      }
    } catch {
      // Not JSON — treat it as markdown.
    }
  }
  return { initialBlocks: undefined, legacyMarkdown: raw };
}

export function BlockReader({ content }: { content: string | null }) {
  // Colourise the JSON path once, at mount, so a shared page shows the same
  // callout colours as the editor. The legacy-markdown path is colourised after
  // parse, below.
  const [{ initialBlocks, legacyMarkdown }] = useState(() => {
    const stored = readStored(content);
    return {
      ...stored,
      initialBlocks: stored.initialBlocks
        ? colorizeCallouts(stored.initialBlocks)
        : stored.initialBlocks,
    };
  });

  // Same schema as the editor — so a shared page that contains a `todoDatabase`
  // block renders (as its inert placeholder) instead of erroring on an unknown
  // type. No provider is mounted here, so the block stays static and calls no
  // server action: read-only means read-only.
  const editor = useCreateBlockNote({
    schema: workspaceSchema,
    initialContent: initialBlocks,
  });

  // Import legacy markdown once, after mount, exactly like the editor does —
  // then the read-only view shows the same blocks the editor would.
  useEffect(() => {
    if (!legacyMarkdown) return;
    let cancelled = false;
    Promise.resolve(editor.tryParseMarkdownToBlocks(legacyMarkdown))
      .then((blocks) => {
        if (cancelled || !blocks || blocks.length === 0) return;
        editor.replaceBlocks(editor.document, colorizeCallouts(blocks));
      })
      .catch(() => {
        // A bad legacy note just renders empty rather than breaking the page.
      });
    return () => {
      cancelled = true;
    };
  }, [editor, legacyMarkdown]);

  return (
    <div className="gv-block-editor">
      <BlockNoteView editor={editor} editable={false} theme={gvTheme} />
    </div>
  );
}
