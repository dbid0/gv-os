"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * The live teamspace context every EMBEDDED workspace database — the To-Do board
 * and the generic table — needs, but a BlockNote block's props can't hold: the
 * teamspace's `clientId` (null = the agency space), a resolver mapping a sheet
 * title to a real page id within THIS teamspace (for deep-linking task rows),
 * and the page-navigation callback those links fire.
 *
 * BlockNote renders custom React blocks through TipTap's node-view PORTALS,
 * which keep the surrounding React context — so a single provider wrapped around
 * the editor (block-editor.tsx) reaches every embedded block. A PRESENT value =
 * the interactive in-app editor; `null` (no provider, the public share reader)
 * keeps every embedded block a static, inert placeholder that touches no server
 * action. This lives in its own module so both block files can share the exact
 * same context object without importing each other.
 */
export interface WorkspaceClientContextValue {
  /** The teamspace. Null = the Global Ventures agency space. */
  clientId: string | null;
  /** Title → page id within this teamspace, or null when nothing carries it. */
  resolvePageId: (title: string) => string | null;
  /** Navigate the workspace to a page, client-side (the tree's `onSelect`). */
  onNavigate: (pageId: string) => void;
}

const WorkspaceClientContext = createContext<WorkspaceClientContextValue | null>(null);

/** Wrap the editor so every embedded database knows its teamspace. */
export function WorkspaceClientProvider({
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
    <WorkspaceClientContext.Provider value={value}>
      {children}
    </WorkspaceClientContext.Provider>
  );
}

/**
 * Read the live teamspace context, or null when there is no provider (the public
 * reader). A null return is the signal to render an inert, server-free placeholder.
 */
export function useWorkspaceClientContext(): WorkspaceClientContextValue | null {
  return useContext(WorkspaceClientContext);
}
