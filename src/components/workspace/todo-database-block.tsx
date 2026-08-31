"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ListTodo } from "lucide-react";
import {
  BlockNoteSchema,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  type BlockNoteEditor,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";

import { listTodos } from "@/app/(app)/workspace/actions";
import { TodoDatabase } from "@/components/workspace/todo-database";
import { TODO_DATABASE_BLOCK_TYPE } from "@/lib/workspace/home";
import { type TodoRow } from "@/lib/workspace/todos";

/**
 * The `todoDatabase` custom BlockNote block — a REAL, embedded interactive To-Do
 * database that lives inside a page's body like any other block. It renders the
 * exact same `<TodoDatabase>` used on Home, so it edits, status-selects, drags,
 * adds, and deletes tasks, all persisted per teamspace; and because it is a
 * block it can be dragged, moved, or deleted anywhere on the page and it
 * survives save/reload (it serialises as `{ type: "todoDatabase" }` in the
 * page's BlockNote JSON — no live data in its props).
 *
 * The block needs the teamspace's `clientId`, which is live server context a
 * block's props can't hold. It reaches the block through React context:
 * `TodoDatabaseClientProvider` wraps the editor (in block-editor.tsx) and the
 * block reads it. BlockNote renders custom React blocks through TipTap's node-view
 * PORTALS, which keep the surrounding React context — so the provider around the
 * editor reaches every embedded block. The initial rows are fetched client-side
 * by the block itself via the `listTodos` server action, keyed on `clientId`.
 *
 * With NO provider (the public read-only share view, block-reader.tsx), the block
 * still renders — as a small static placeholder — and never calls a server
 * action, so a shared page that happens to contain one can't break or leak.
 */

/**
 * The live teamspace context an embedded To-Do database needs: its board's
 * `clientId` (null = the agency board), a resolver that maps a sheet title to a
 * real page id within THIS teamspace (for the deep-linking task rows), and the
 * page-navigation callback those links fire. A PRESENT value = the interactive
 * in-app editor; `null` = no provider (the public reader), which keeps the block
 * a static, inert placeholder that touches no server action.
 */
export interface TodoDatabaseContextValue {
  clientId: string | null;
  /** Title → page id within this teamspace, or null when nothing carries it. */
  resolvePageId: (title: string) => string | null;
  /** Navigate the workspace to a page, client-side (the tree's `onSelect`). */
  onNavigate: (pageId: string) => void;
}

const TodoDatabaseClientContext = createContext<TodoDatabaseContextValue | null>(null);

/** Wrap the editor so every embedded To-Do database knows its teamspace. */
export function TodoDatabaseClientProvider({
  clientId,
  resolvePageId,
  onNavigate,
  children,
}: {
  clientId: string | null;
  resolvePageId: (title: string) => string | null;
  onNavigate: (pageId: string) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ clientId, resolvePageId, onNavigate }),
    [clientId, resolvePageId, onNavigate],
  );
  return (
    <TodoDatabaseClientContext.Provider value={value}>
      {children}
    </TodoDatabaseClientContext.Provider>
  );
}

/**
 * The block's body. Inside the editor (a provider is present) it fetches the
 * teamspace's rows once and renders the live, interactive `<TodoDatabase>` —
 * which re-seeds itself when the fetched rows arrive. Outside a provider (public
 * share) it stays a static, inert placeholder and touches no server action.
 */
function EmbeddedTodoDatabase() {
  const ctx = useContext(TodoDatabaseClientContext);
  const interactive = ctx !== null;
  const clientId = ctx?.clientId ?? null;
  const [todos, setTodos] = useState<TodoRow[] | null>(null);

  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    listTodos(clientId)
      .then((rows) => {
        if (!cancelled) setTodos(rows);
      })
      .catch(() => {
        if (!cancelled) setTodos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [interactive, clientId]);

  // `contentEditable={false}` hands the whole subtree to React — ProseMirror
  // never tries to edit inside it — so the To-Do's own inputs, menus, and drag
  // handles work normally while the block itself stays draggable/deletable from
  // the editor's side menu like any block.
  return (
    <div className="gv-todo-db-block" contentEditable={false}>
      {interactive && ctx ? (
        <TodoDatabase
          clientId={clientId}
          initialTodos={todos ?? []}
          resolvePageId={ctx.resolvePageId}
          onNavigate={ctx.onNavigate}
        />
      ) : (
        <div className="border-border/60 bg-secondary/30 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <ListTodo className="size-4" />
          <span>To-Do database</span>
        </div>
      )}
    </div>
  );
}

/**
 * The `todoDatabase` block spec. `createReactBlockSpec` (BlockNote 0.54) returns
 * a FACTORY, so it is called once here to get the concrete spec the schema
 * registers. The block has no props and no editable content — its whole UI is
 * the embedded database.
 */
const todoDatabaseBlock = createReactBlockSpec(
  { type: TODO_DATABASE_BLOCK_TYPE, propSchema: {}, content: "none" },
  { render: () => <EmbeddedTodoDatabase /> },
)();

/**
 * The Workspace editor schema: the default blocks plus our `todoDatabase`.
 * Shared by the editor (block-editor.tsx) and the read-only reader
 * (block-reader.tsx) so a page containing the block renders in both.
 */
export const workspaceSchema = BlockNoteSchema.create().extend({
  blockSpecs: { [TODO_DATABASE_BLOCK_TYPE]: todoDatabaseBlock },
});

/** The editor type for the Workspace schema — for typing helpers cleanly. */
export type WorkspaceEditor = typeof workspaceSchema.BlockNoteEditor;
/** The PartialBlock type for the Workspace schema (stored/loaded page content). */
export type WorkspacePartialBlock = typeof workspaceSchema.PartialBlock;

/**
 * The "/" slash-menu item that inserts a To-Do database. Aliased on "database"
 * and "tasks" so either search finds it. Uses BlockNote's own
 * `insertOrUpdateBlockForSlashMenu`, exactly like the default items.
 */
export function todoDatabaseSlashItem(
  editor: BlockNoteEditor<
    typeof workspaceSchema.blockSchema,
    typeof workspaceSchema.inlineContentSchema,
    typeof workspaceSchema.styleSchema
  >,
): DefaultReactSuggestionItem {
  return {
    title: "To-Do database",
    subtext: "An interactive, editable task table",
    aliases: ["todo", "to-do", "database", "tasks", "table"],
    group: "Advanced",
    icon: <ListTodo className="size-4" />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, { type: TODO_DATABASE_BLOCK_TYPE });
    },
  };
}

/**
 * The full slash-menu item list for the Workspace editor: the defaults plus our
 * To-Do database, filtered by the live query. Passed to `SuggestionMenuController`.
 */
export function getWorkspaceSlashItems(
  editor: BlockNoteEditor<
    typeof workspaceSchema.blockSchema,
    typeof workspaceSchema.inlineContentSchema,
    typeof workspaceSchema.styleSchema
  >,
  query: string,
): DefaultReactSuggestionItem[] {
  return filterSuggestionItems(
    [...getDefaultReactSlashMenuItems(editor), todoDatabaseSlashItem(editor)],
    query,
  );
}
