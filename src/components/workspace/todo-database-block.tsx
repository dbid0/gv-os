"use client";

import { useEffect, useState } from "react";
import { ListTodo, Table } from "lucide-react";
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
import {
  getMultiColumnSlashMenuItems,
  withMultiColumn,
} from "@blocknote/xl-multi-column";

import { createDatabase, listTodos } from "@/app/(app)/workspace/actions";
import {
  DATABASE_BLOCK_TYPE,
  databaseBlock,
} from "@/components/workspace/database-block";
import { TodoDatabase } from "@/components/workspace/todo-database";
import {
  useWorkspaceClientContext,
  WorkspaceClientProvider,
  type WorkspaceClientContextValue,
} from "@/components/workspace/workspace-client-context";
import { TODO_DATABASE_BLOCK_TYPE } from "@/lib/workspace/home";
import { type TodoRow } from "@/lib/workspace/todos";

/**
 * The custom Workspace BlockNote blocks — the specialised `todoDatabase` board
 * and the generic `database` table — plus the schema and slash menu that make
 * them insertable. Both are REAL, embedded interactive databases that live
 * inside a page's body like any other block, persist per teamspace, and survive
 * save/reload (they serialise as their `{ type, props }` — no live data in the
 * page JSON). Both reach their teamspace through the shared
 * `WorkspaceClientProvider` context (block-editor.tsx wraps the editor), threaded
 * through TipTap's node-view portals; with NO provider (the public reader) each
 * stays a static, inert placeholder that calls no server action.
 *
 * The provider/context lives in workspace-client-context.tsx so this file and
 * database-block.tsx can share the SAME context object without importing each
 * other. `TodoDatabaseClientProvider` is re-exported here (as an alias of
 * `WorkspaceClientProvider`) for the existing block-editor.tsx import site.
 */

/** Re-exported for block-editor.tsx — the provider that wraps the editor. */
export const TodoDatabaseClientProvider = WorkspaceClientProvider;
export type TodoDatabaseContextValue = WorkspaceClientContextValue;

/**
 * The To-Do database block body. Inside the editor (a provider is present) it
 * fetches the teamspace's rows once and renders the live, interactive
 * `<TodoDatabase>`. Outside a provider (public share) it stays a static, inert
 * placeholder and touches no server action.
 */
function EmbeddedTodoDatabase() {
  const ctx = useWorkspaceClientContext();
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

  // `contentEditable={false}` hands the whole subtree to React so the To-Do's
  // own inputs, menus, and drag handles work while the block stays
  // draggable/deletable from the editor's side menu like any block.
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
 * registers. The block has no props and no editable content.
 */
const todoDatabaseBlock = createReactBlockSpec(
  { type: TODO_DATABASE_BLOCK_TYPE, propSchema: {}, content: "none" },
  { render: () => <EmbeddedTodoDatabase /> },
)();

/**
 * The Workspace editor schema: the default blocks, our two custom database
 * blocks, AND the official multi-column blocks (`columnList` / `column`) via
 * `withMultiColumn`. Shared by the editor (block-editor.tsx) and the read-only
 * reader (block-reader.tsx), so a page containing any of those blocks — a
 * two-column Home, an embedded database, or a migrated Notion page whose columns
 * were flattened — renders in both. `withMultiColumn` wraps the extended schema,
 * so the custom blocks and the column blocks all coexist.
 */
export const workspaceSchema = withMultiColumn(
  BlockNoteSchema.create().extend({
    blockSpecs: {
      [TODO_DATABASE_BLOCK_TYPE]: todoDatabaseBlock,
      [DATABASE_BLOCK_TYPE]: databaseBlock,
    },
  }),
);

/** The editor type for the Workspace schema — for typing helpers cleanly. */
export type WorkspaceEditor = typeof workspaceSchema.BlockNoteEditor;
/** The PartialBlock type for the Workspace schema (stored/loaded page content). */
export type WorkspacePartialBlock = typeof workspaceSchema.PartialBlock;

type WorkspaceSlashEditor = BlockNoteEditor<
  typeof workspaceSchema.blockSchema,
  typeof workspaceSchema.inlineContentSchema,
  typeof workspaceSchema.styleSchema
>;

/**
 * The "/" slash-menu item that inserts a To-Do database. Aliased on "tasks" so a
 * task search finds it; "database"/"table" now belong to the generic table below.
 */
export function todoDatabaseSlashItem(
  editor: WorkspaceSlashEditor,
): DefaultReactSuggestionItem {
  return {
    title: "To-Do database",
    subtext: "An interactive, editable task table",
    aliases: ["todo", "to-do", "tasks", "checklist"],
    group: "Databases",
    icon: <ListTodo className="size-4" />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, { type: TODO_DATABASE_BLOCK_TYPE });
    },
  };
}

/**
 * The "/" slash-menu item that inserts a generic TABLE database. It creates a
 * fresh database in this teamspace (a "Name" + "Status" starter, so it is
 * usable immediately), then inserts a `database` block carrying its id. Aliased
 * on "table"/"grid"/"database" so any of those searches find it.
 */
export function databaseSlashItem(
  editor: WorkspaceSlashEditor,
  clientId: string | null,
): DefaultReactSuggestionItem {
  return {
    title: "Database",
    subtext: "An editable table with any columns",
    aliases: ["database", "table", "grid", "db"],
    group: "Databases",
    icon: <Table className="size-4" />,
    onItemClick: async () => {
      try {
        const created = await createDatabase(clientId);
        insertOrUpdateBlockForSlashMenu(editor, {
          type: DATABASE_BLOCK_TYPE,
          props: { databaseId: created.id },
        });
      } catch (e) {
        // A failed create simply inserts nothing rather than a broken block.
        console.error("Failed to create database:", e);
      }
    },
  };
}

/**
 * The full slash-menu item list for the Workspace editor: the defaults, the
 * multi-column inserts ("Two Columns" / "Three Columns"), plus our two database
 * blocks, filtered by the live query. Passed to `SuggestionMenuController`.
 * `clientId` scopes a newly-created generic database to the current teamspace.
 */
export function getWorkspaceSlashItems(
  editor: WorkspaceSlashEditor,
  query: string,
  clientId: string | null,
): DefaultReactSuggestionItem[] {
  return filterSuggestionItems(
    [
      ...getDefaultReactSlashMenuItems(editor),
      ...getMultiColumnSlashMenuItems(editor),
      todoDatabaseSlashItem(editor),
      databaseSlashItem(editor, clientId),
    ],
    query,
  );
}
