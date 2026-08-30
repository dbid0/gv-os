/**
 * The Workspace To-Do database — the pure core, shared by the server query, the
 * server actions, the client component, and the tests, so all four reason about
 * status and ordering off the exact same code.
 *
 * A To-Do belongs to a TEAMSPACE via `clientId` (a client's board when set, the
 * "Global Ventures" agency board when null), mirroring `workspace_pages`. This
 * file touches neither the database nor React — it is data-shaping only, which
 * is why it can be unit-tested exhaustively.
 */

/**
 * The Status SELECT — exactly Notion's three options, in board order. `Not
 * started` is the neutral default; `In progress` is blue; `Done` is green.
 * The ONLY three values a status column may hold.
 */
export const TODO_STATUSES = ["Not started", "In progress", "Done"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

/** The default a fresh row lands on. */
export const DEFAULT_TODO_STATUS: TodoStatus = "Not started";

/** A type guard: is `value` one of the three allowed statuses? */
export function isTodoStatus(value: unknown): value is TodoStatus {
  return (
    typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Coerce any stored/incoming value to a valid status, defaulting an unknown one
 * to `Not started`. The server validates writes with `isTodoStatus`; this is the
 * READ-side safety net so a legacy or hand-edited row never renders a bad pill.
 */
export function normalizeTodoStatus(value: unknown): TodoStatus {
  return isTodoStatus(value) ? value : DEFAULT_TODO_STATUS;
}

/**
 * One To-Do row as every surface passes it around — the serializable shape the
 * server query returns and the client renders. `dueDate` is a plain `yyyy-mm-dd`
 * string (or null), never a Date, so it crosses the server→client boundary as-is.
 */
export interface TodoRow {
  id: string;
  /** The teamspace. Null = the Global Ventures agency board. */
  clientId: string | null;
  task: string;
  status: TodoStatus;
  dueDate: string | null;
  sortOrder: number;
}

/** The minimum a row needs to be re-indexed: an id and its current order. */
export interface TodoOrderRow {
  id: string;
  sortOrder: number;
}

/** What a reorder writes: a sequential `sortOrder` (0, 1, 2 …) for every row. */
export interface TodoReorderPlan {
  updates: { id: string; sortOrder: number }[];
}

/** Stable order — sortOrder, then id — so a re-index never reshuffles ties. */
function orderCompare(a: TodoOrderRow, b: TodoOrderRow): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id.localeCompare(b.id);
}

/**
 * Plan a drag-and-drop reorder: pull `moveId` out and slot it immediately before
 * `beforeId` (or at the end of the list when `beforeId` is null / unknown), then
 * re-index the WHOLE list to a clean sequential `sortOrder`. It is PURE, so the
 * server action and the client's optimistic update run the exact same reasoning
 * off the exact same inputs.
 *
 * `rows` must already be scoped to one teamspace — the caller filters by
 * `clientId` before handing them over, the same way a page move scopes to its
 * teamspace. Returns null for an impossible move (an unknown `moveId`), or when
 * dropping a row before itself is a no-op the caller can skip.
 */
export function planTodoReorder(
  rows: TodoOrderRow[],
  moveId: string,
  beforeId: string | null,
): TodoReorderPlan | null {
  if (!rows.some((r) => r.id === moveId)) return null;

  const rest = rows.filter((r) => r.id !== moveId).sort(orderCompare);

  let insertAt = rest.length;
  if (beforeId !== null && beforeId !== moveId) {
    const idx = rest.findIndex((r) => r.id === beforeId);
    if (idx >= 0) insertAt = idx;
  }

  const ordered = [
    ...rest.slice(0, insertAt).map((r) => r.id),
    moveId,
    ...rest.slice(insertAt).map((r) => r.id),
  ];

  return { updates: ordered.map((id, i) => ({ id, sortOrder: i })) };
}

/**
 * Apply a reorder plan to a list of full rows, returning them in the new order
 * with their `sortOrder` rewritten to match. The client uses this to reflect a
 * drag optimistically before the server round-trips; because it runs the same
 * plan the server will, the two never disagree.
 */
export function applyTodoReorder<T extends TodoRow>(
  rows: T[],
  plan: TodoReorderPlan,
): T[] {
  const orderById = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
  return rows
    .map((r) => ({ ...r, sortOrder: orderById.get(r.id) ?? r.sortOrder }))
    .sort(orderCompare);
}
