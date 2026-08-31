/**
 * The Workspace generic DATABASE — the pure core, shared by the server actions,
 * the client table, and the tests, so all three reason about columns, cell
 * values, and ordering off the exact same code.
 *
 * A database belongs to a TEAMSPACE via `clientId` (a client's space when set,
 * the "Global Ventures" agency space when null), mirroring `workspace_pages` and
 * `workspace_todos`. This file touches neither the database nor React — it is
 * data-shaping only, which is why it can be unit-tested exhaustively.
 *
 * The generic table is deliberately a TABLE VIEW only: five column types (text,
 * select, date, checkbox, url), no filters/sorts, no relations/rollups/formulas,
 * no board/gallery/calendar. The heavy stuff a real Notion power-user rarely
 * touches is left out on purpose — this is the simple, editable table the rest
 * of the Workspace structure is built on.
 */

/** The five column types a generic database column may be. */
export const DATABASE_COLUMN_TYPES = [
  "text",
  "select",
  "date",
  "checkbox",
  "url",
] as const;

export type DatabaseColumnType = (typeof DATABASE_COLUMN_TYPES)[number];

/** A type guard: is `value` one of the five allowed column types? */
export function isDatabaseColumnType(value: unknown): value is DatabaseColumnType {
  return (
    typeof value === "string" &&
    (DATABASE_COLUMN_TYPES as readonly string[]).includes(value)
  );
}

/**
 * The colour palette a `select` option paints its pill with — the SAME family
 * the To-Do status uses (gray / blue / green), extended with the rest of the
 * Notion-style set. A colour is stored by NAME on the option, and rendered
 * through {@link selectColorStyle}, so the stored data never carries CSS.
 */
export const SELECT_COLORS = [
  { name: "gray", chip: "bg-secondary text-muted-foreground", dot: "bg-faint" },
  {
    name: "blue",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  {
    name: "green",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    name: "yellow",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  {
    name: "orange",
    chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
    dot: "bg-orange-500 dark:bg-orange-400",
  },
  {
    name: "red",
    chip: "bg-red-500/15 text-red-600 dark:text-red-300",
    dot: "bg-red-500 dark:bg-red-400",
  },
  {
    name: "purple",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
    dot: "bg-violet-500 dark:bg-violet-400",
  },
  {
    name: "pink",
    chip: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
    dot: "bg-pink-500 dark:bg-pink-400",
  },
] as const;

export type SelectColorName = (typeof SELECT_COLORS)[number]["name"];

/** Every colour name, in palette order — the recolour picker iterates this. */
export const SELECT_COLOR_NAMES: SelectColorName[] = SELECT_COLORS.map((c) => c.name);

/** The neutral default a fresh option lands on. */
export const DEFAULT_SELECT_COLOR: SelectColorName = "gray";

/** The chip + dot classes for a colour name, defaulting to grey for a bad one. */
export function selectColorStyle(color: string): { chip: string; dot: string } {
  const found = SELECT_COLORS.find((c) => c.name === color) ?? SELECT_COLORS[0];
  return { chip: found.chip, dot: found.dot };
}

/** One choice on a `select` column: a stable id, a label, and a colour name. */
export interface SelectOption {
  id: string;
  name: string;
  color: SelectColorName;
}

/**
 * One column definition. `options` is present only for a `select` column; for
 * every other type it is absent. The column `id` is stable across renames and
 * retypes — it is what a row's `values` map is keyed by.
 */
export interface DatabaseColumn {
  id: string;
  name: string;
  type: DatabaseColumnType;
  options?: SelectOption[];
}

/**
 * A single cell's value. The stored shape depends on the column type:
 *  - text / url  → a string
 *  - select      → the chosen option's id (a string), or null
 *  - date        → an ISO `yyyy-mm-dd` string, or null
 *  - checkbox    → a boolean
 * A missing key in a row's `values` renders as empty for that column.
 */
export type DbCellValue = string | boolean | null;

/** One row: its id, its per-column values, and its manual order. */
export interface DatabaseRow {
  id: string;
  values: Record<string, DbCellValue>;
  sortOrder: number;
}

/** A whole database as every surface passes it around. */
export interface DatabaseData {
  id: string;
  /** The teamspace. Null = the Global Ventures agency space. */
  clientId: string | null;
  title: string;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
}

/**
 * The starter columns a fresh database is created with, so it is immediately
 * usable: a "Name" text column and a "Status" select column carrying the same
 * three options (and colours) as the To-Do board. `newId` mints every id (a
 * column id and each option id), so the caller controls id generation (real
 * `crypto.randomUUID` in the action, a counter in a test).
 */
export function buildDefaultColumns(newId: () => string): DatabaseColumn[] {
  return [
    { id: newId(), name: "Name", type: "text" },
    {
      id: newId(),
      name: "Status",
      type: "select",
      options: [
        { id: newId(), name: "Not started", color: "gray" },
        { id: newId(), name: "In progress", color: "blue" },
        { id: newId(), name: "Done", color: "green" },
      ],
    },
  ];
}

/** Is `optionId` a real option on this (select) column? */
export function isKnownOption(column: DatabaseColumn, optionId: unknown): boolean {
  return (
    typeof optionId === "string" &&
    (column.options ?? []).some((o) => o.id === optionId)
  );
}

/** A `yyyy-mm-dd` shape check — the only date form a cell ever stores. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sanitize an incoming cell value for a column, throwing on a value that must
 * never be written (an unknown select option, a malformed date). This is the
 * WRITE-side gate the server action runs before persisting a single cell:
 *  - checkbox → coerced to a real boolean (only `true` is true)
 *  - select   → kept only if it is a known option id; empty clears to null
 *  - date     → kept only if it matches yyyy-mm-dd; empty clears to null
 *  - text/url → kept as a string; null/undefined becomes ""
 */
export function sanitizeCellValue(column: DatabaseColumn, value: unknown): DbCellValue {
  switch (column.type) {
    case "checkbox":
      return value === true;
    case "select":
      if (value === null || value === undefined || value === "") return null;
      if (!isKnownOption(column, value)) throw new Error("Unknown select option.");
      return value as string;
    case "date":
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "string" && ISO_DATE.test(value)) return value;
      throw new Error("Invalid date value.");
    case "url":
    case "text":
      if (value === null || value === undefined) return "";
      if (typeof value !== "string") throw new Error("Invalid text value.");
      return value;
  }
}

/** Render a value as plain text — a select shows its option's LABEL, not its id. */
function valueAsText(value: DbCellValue, from: DatabaseColumn): string {
  if (from.type === "select") {
    const opt = (from.options ?? []).find((o) => o.id === value);
    return opt ? opt.name : "";
  }
  return typeof value === "string" ? value : "";
}

/**
 * Coerce one existing value when its column is RETYPED, so a type change never
 * leaves a cell holding a value the new type can't mean. Pure and total:
 *  - → text/url  : keep a string; a select becomes its option LABEL; else ""
 *  - → select    : keep only when the value is a valid id in the NEW options; else null
 *  - → date      : keep only a well-formed yyyy-mm-dd string; else null
 *  - → checkbox  : true only when the old value was exactly `true`; else false
 *
 * `toOptions` matters only for `select` (the ids the new column recognises); it
 * defaults to empty, which is why retyping a fresh column to select clears every
 * cell — there are no options to validate against yet.
 */
export function coerceValueOnRetype(
  value: DbCellValue | undefined,
  from: DatabaseColumn,
  toType: DatabaseColumnType,
  toOptions: SelectOption[] = [],
): DbCellValue {
  const v: DbCellValue = value === undefined ? null : value;
  switch (toType) {
    case "checkbox":
      return v === true;
    case "select":
      return typeof v === "string" && toOptions.some((o) => o.id === v) ? v : null;
    case "date":
      return typeof v === "string" && ISO_DATE.test(v) ? v : null;
    case "text":
    case "url":
      return valueAsText(v, from);
  }
}

/**
 * Recompute every row's value for a column that is being retyped, returning a
 * map of rowId → new value for just that one column. The server writes these
 * back per row; the client applies the same map optimistically.
 */
export function retypeColumnValues(
  rows: DatabaseRow[],
  from: DatabaseColumn,
  toType: DatabaseColumnType,
  toOptions: SelectOption[] = [],
): Record<string, DbCellValue> {
  const out: Record<string, DbCellValue> = {};
  for (const row of rows) {
    out[row.id] = coerceValueOnRetype(row.values[from.id], from, toType, toOptions);
  }
  return out;
}

/**
 * Put columns into the given id order. Any id not present in `orderedIds` is
 * appended in its original relative order (a defensive no-drop guarantee), and
 * any unknown id in `orderedIds` is ignored — so a stale client order can never
 * lose or invent a column.
 */
export function reorderColumns(
  columns: DatabaseColumn[],
  orderedIds: string[],
): DatabaseColumn[] {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const result: DatabaseColumn[] = [];
  for (const id of orderedIds) {
    const col = byId.get(id);
    if (col) {
      result.push(col);
      byId.delete(id);
    }
  }
  for (const col of columns) if (byId.has(col.id)) result.push(col);
  return result;
}

// --- Row ordering -----------------------------------------------------------
//
// The exact same discipline as the To-Do board (`planTodoReorder`): a pure
// re-index the server and the client's optimistic update both run off the same
// inputs, so the two orders never disagree.

/** The minimum a row needs to be re-indexed: an id and its current order. */
export interface RowOrder {
  id: string;
  sortOrder: number;
}

/** What a reorder writes: a sequential `sortOrder` (0, 1, 2 …) for every row. */
export interface RowReorderPlan {
  updates: { id: string; sortOrder: number }[];
}

/** Stable order — sortOrder, then id — so a re-index never reshuffles ties. */
function orderCompare(a: RowOrder, b: RowOrder): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id.localeCompare(b.id);
}

/**
 * Plan a drag-and-drop reorder: pull `moveId` out and slot it immediately before
 * `beforeId` (or at the end when `beforeId` is null / unknown), then re-index the
 * WHOLE list to a clean sequential `sortOrder`. Pure — the server action and the
 * client's optimistic update run the exact same reasoning. Returns null for an
 * unknown `moveId`.
 */
export function planRowReorder(
  rows: RowOrder[],
  moveId: string,
  beforeId: string | null,
): RowReorderPlan | null {
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
 * with their `sortOrder` rewritten to match — the client's optimistic mirror of
 * the drag, running the same plan the server will.
 */
export function applyRowReorder<T extends DatabaseRow>(
  rows: T[],
  plan: RowReorderPlan,
): T[] {
  const orderById = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
  return rows
    .map((r) => ({ ...r, sortOrder: orderById.get(r.id) ?? r.sortOrder }))
    .sort(orderCompare);
}
