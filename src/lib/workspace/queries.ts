import "server-only";

import { asc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  clients,
  workspacePages,
  workspaceTodos,
  type WorkspacePage,
} from "@/db/schema/app";
import { roster } from "@/lib/roster";
import {
  buildPageTree,
  type PageNode,
  type WorkspacePageLite,
} from "@/lib/workspace/tree";
import { normalizeTodoStatus, type TodoRow } from "@/lib/workspace/todos";

/**
 * The Workspace read layer. Every function is FAIL-SOFT: a database hiccup
 * returns an empty result, never a thrown error, so a wiki outage degrades to
 * "no pages yet" instead of a broken screen.
 */

const AGENCY_ACCENT = "#52b7ff"; // the brand highlight — the agency's data colour.

/** A teamspace: one active client, or the Global Ventures agency (null client). */
export interface Teamspace {
  /** The client this teamspace belongs to. Null = the agency teamspace. */
  clientId: string | null;
  /** The client slug, for its logo. Null for the agency. */
  slug: string | null;
  name: string;
  /** The teamspace's data colour, for its icon chip. */
  accent: string;
}

export interface TeamspaceTree extends Teamspace {
  pages: PageNode[];
}

function accentForSlug(slug: string | null): string {
  if (!slug) return AGENCY_ACCENT;
  return roster.find((c) => c.slug === slug)?.accent ?? AGENCY_ACCENT;
}

function toLite(row: WorkspacePage): WorkspacePageLite {
  return {
    id: row.id,
    clientId: row.clientId,
    parentId: row.parentId,
    title: row.title,
    icon: row.icon,
    content: row.content,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The teamspaces, agency first, then every active client by name. Derived from
 * the roster — there is no teamspaces table to drift from the client list.
 */
export async function listTeamspaces(): Promise<Teamspace[]> {
  const agency: Teamspace = {
    clientId: null,
    slug: null,
    name: "Global Ventures",
    accent: AGENCY_ACCENT,
  };
  try {
    const db = getDb();
    const rows = await db
      .select({ id: clients.id, name: clients.name, slug: clients.slug })
      .from(clients)
      .where(eq(clients.status, "active"))
      .orderBy(clients.name);
    return [
      agency,
      ...rows.map((c) => ({
        clientId: c.id,
        slug: c.slug,
        name: c.name,
        accent: accentForSlug(c.slug),
      })),
    ];
  } catch {
    return [agency];
  }
}

/**
 * Every teamspace with its pages already shaped into a nested tree (via the
 * pure `buildPageTree`). This one call gives the page everything it renders:
 * the teamspace list, and each teamspace's page forest with content on every
 * node so the reader can open a page without a second round-trip.
 */
export async function listWorkspaceTree(): Promise<TeamspaceTree[]> {
  try {
    const db = getDb();
    const [teamspaces, rows] = await Promise.all([
      listTeamspaces(),
      db.select().from(workspacePages),
    ]);

    const byTeamspace = new Map<string, WorkspacePageLite[]>();
    for (const row of rows) {
      const key = row.clientId ?? "agency";
      const list = byTeamspace.get(key) ?? [];
      list.push(toLite(row));
      byTeamspace.set(key, list);
    }

    return teamspaces.map((ts) => ({
      ...ts,
      pages: buildPageTree(byTeamspace.get(ts.clientId ?? "agency") ?? []),
    }));
  } catch {
    return [];
  }
}

/**
 * One teamspace with its page tree, scoped to a single client (or the agency).
 *
 * This is the fold-under-clients read: a client's docs live inside the client,
 * so a page never asks for the whole workspace, only the teamspace it is
 * showing. `slug` null selects the Global Ventures agency teamspace (the
 * templates space); a slug that is not an active client returns null so the
 * route can 404. Fail-soft: a database hiccup degrades to an empty tree, never
 * a thrown error.
 */
export async function getTeamspaceTree(
  slug: string | null,
): Promise<TeamspaceTree | null> {
  const teamspaces = await listTeamspaces();
  const teamspace = teamspaces.find((ts) =>
    slug === null ? ts.clientId === null : ts.slug === slug,
  );
  if (!teamspace) return null;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(workspacePages)
      .where(
        teamspace.clientId === null
          ? isNull(workspacePages.clientId)
          : eq(workspacePages.clientId, teamspace.clientId),
      );
    return { ...teamspace, pages: buildPageTree(rows.map(toLite)) };
  } catch {
    return { ...teamspace, pages: [] };
  }
}

/**
 * A teamspace's To-Do rows, in board order (sortOrder, then id), shaped into the
 * serializable `TodoRow` the Home dashboard renders. `clientId` null selects the
 * agency board. Fail-soft: a database hiccup degrades to an empty list, never a
 * thrown error, so a To-Do outage shows "no tasks yet" instead of breaking Home.
 */
export async function listTeamspaceTodos(clientId: string | null): Promise<TodoRow[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(workspaceTodos)
      .where(
        clientId === null
          ? isNull(workspaceTodos.clientId)
          : eq(workspaceTodos.clientId, clientId),
      )
      .orderBy(asc(workspaceTodos.sortOrder), asc(workspaceTodos.id));
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      task: r.task,
      status: normalizeTodoStatus(r.status),
      dueDate: r.dueDate,
      sortOrder: r.sortOrder,
    }));
  } catch {
    return [];
  }
}

/** One page in full, for a deep-linked open. Null when it does not exist. */
export async function getPage(id: string): Promise<WorkspacePage | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workspacePages)
      .where(eq(workspacePages.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}
