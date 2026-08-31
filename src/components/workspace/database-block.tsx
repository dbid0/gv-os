"use client";

import { useEffect, useState } from "react";
import { Table } from "lucide-react";
import { createReactBlockSpec } from "@blocknote/react";

import { getDatabase } from "@/app/(app)/workspace/actions";
import { DatabaseTable } from "@/components/workspace/database-table";
import { useWorkspaceClientContext } from "@/components/workspace/workspace-client-context";
import { type DatabaseData } from "@/lib/workspace/database";

/**
 * The `database` custom BlockNote block — a REAL, embedded interactive TABLE
 * database that lives inside a page's body like any other block. It renders the
 * generic `<DatabaseTable>`, so it edits cells, adds/retypes/reorders columns,
 * adds/deletes/reorders rows — all persisted per teamspace. Because it is a
 * block it can be dragged, moved, or deleted anywhere on the page and it
 * survives save/reload: it serialises as `{ type: "database", props: {
 * databaseId } }` — only the id lives in the block, never the live data.
 *
 * The block reaches its teamspace through the SAME `WorkspaceClientProvider`
 * context the To-Do database uses (threaded through TipTap's node-view portals).
 * With a provider present (the in-app editor) it loads the database by id via
 * the `getDatabase` server action and mounts the live table; with NO provider
 * (the public read-only share reader) it renders an inert placeholder and never
 * calls a server action, so a shared page containing one can't break or leak.
 */

/** The custom block's type name, shared with the editor schema + slash menu. */
export const DATABASE_BLOCK_TYPE = "database";

/** A small inert bar for the loading / not-found / public-reader states. */
function PlaceholderBar({ label }: { label: string }) {
  return (
    <div className="border-border/60 bg-secondary/30 text-muted-foreground my-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <Table className="size-4" />
      <span>{label}</span>
    </div>
  );
}

/**
 * The block body. Inside the editor (a provider is present) it fetches the
 * database once by id and mounts the live, interactive `<DatabaseTable>`.
 * Outside a provider (public share) it stays a static, inert placeholder that
 * touches no server action.
 */
function EmbeddedDatabase({ databaseId }: { databaseId: string }) {
  const ctx = useWorkspaceClientContext();
  const interactive = ctx !== null;
  const [data, setData] = useState<DatabaseData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!interactive || !databaseId) return;
    let cancelled = false;
    getDatabase(databaseId)
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [interactive, databaseId]);

  // `contentEditable={false}` hands the whole subtree to React — ProseMirror
  // never edits inside it — so the table's own inputs, menus, and drag handles
  // work normally while the block itself stays draggable/deletable from the
  // editor's side menu like any block.
  return (
    <div className="gv-db-block" contentEditable={false}>
      {interactive && databaseId ? (
        data ? (
          <DatabaseTable databaseId={databaseId} initialData={data} />
        ) : (
          <PlaceholderBar
            label={missing ? "Database not found" : "Loading database…"}
          />
        )
      ) : (
        <PlaceholderBar label="Database" />
      )}
    </div>
  );
}

/**
 * The `database` block spec. `createReactBlockSpec` (BlockNote 0.54) returns a
 * FACTORY, so it is called once here to get the concrete spec the schema
 * registers. Its only prop is the `databaseId` it renders.
 */
export const databaseBlock = createReactBlockSpec(
  {
    type: DATABASE_BLOCK_TYPE,
    propSchema: { databaseId: { default: "" } },
    content: "none",
  },
  {
    render: (props) => (
      <EmbeddedDatabase databaseId={String(props.block.props.databaseId ?? "")} />
    ),
  },
)();
