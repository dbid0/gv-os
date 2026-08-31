"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  CircleDot,
  GripVertical,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import {
  addColumn,
  addRow,
  deleteColumn,
  deleteRow,
  renameDatabase,
  reorderColumns,
  reorderRow,
  updateCell,
  updateColumn,
} from "@/app/(app)/workspace/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import {
  DATABASE_COLUMN_TYPES,
  type DatabaseColumn,
  type DatabaseColumnType,
  type DatabaseData,
  type DatabaseRow,
  type DbCellValue,
  isKnownOption,
  planRowReorder,
  retypeColumnValues,
  SELECT_COLORS,
  selectColorStyle,
  type SelectColorName,
  type SelectOption,
} from "@/lib/workspace/database";
import { cn } from "@/lib/utils";

/**
 * The generic, editable TABLE database — the Notion-style "any columns" grid a
 * page embeds as a block. It mirrors the To-Do board's proven interaction
 * patterns exactly: inline-edit cells, a colored select pill → base-ui menu,
 * native HTML5 drag to reorder rows (and columns), add / delete, and OPTIMISTIC
 * mutations (apply → persist → revert + toast). State lives here, seeded from
 * `initialData`; every column and row change persists through the workspace
 * server actions, and a failure reverts to the pre-change snapshot.
 *
 * Deliberately a table view ONLY — no board/gallery/calendar, no filters/sorts,
 * no relations/rollups/formulas, no comments. The five column types (text,
 * select, date, checkbox, url) cover what the workspace actually uses.
 */

const COL_W = "w-[184px]";

type DropMode = "before" | "after";

/** A short, safe client id for a freshly-added option (server keeps its own). */
function localId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `opt-${Math.random().toString(36).slice(2)}`;
}

export function DatabaseTable({
  databaseId,
  initialData,
}: {
  databaseId: string;
  initialData: DatabaseData;
}) {
  const { toast } = useToast();
  const [columns, setColumns] = useState<DatabaseColumn[]>(initialData.columns);
  const [rows, setRows] = useState<DatabaseRow[]>(initialData.rows);
  const [title, setTitle] = useState(initialData.title);
  const [, start] = useTransition();

  // Re-seed from the server when a fresh snapshot arrives (a route refresh), but
  // never clobber optimistic local edits mid-flight.
  const initialRef = useRef(initialData);
  useEffect(() => {
    if (initialRef.current === initialData) return;
    initialRef.current = initialData;
    setColumns(initialData.columns);
    setRows(initialData.rows);
    setTitle(initialData.title);
  }, [initialData]);

  /** Which column's settings popover is open (only one at a time). */
  const [openColMenu, setOpenColMenu] = useState<string | null>(null);
  /** Which row was just added, so its first cell can focus. */
  const [focusRowId, setFocusRowId] = useState<string | null>(null);

  // Drag state. `dragKind` keeps row-drag and column-drag from cross-talking —
  // both use the native HTML5 drag system, so each set of handlers ignores the
  // other's drag. The active ids are refs so the hot dragover handlers read live.
  const dragKind = useRef<null | "row" | "col">(null);
  const rowDragId = useRef<string | null>(null);
  const colDragId = useRef<string | null>(null);
  const [rowDrag, setRowDrag] = useState<string | null>(null);
  const [colDrag, setColDrag] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<{ id: string; mode: DropMode } | null>(null);
  const [colDrop, setColDrop] = useState<{ id: string; mode: DropMode } | null>(null);

  /** Optimistic mutation: apply the given next state, persist, revert on failure. */
  const mutate = useCallback(
    (
      next: { columns?: DatabaseColumn[]; rows?: DatabaseRow[] },
      persist: () => Promise<unknown>,
      failTitle: string,
    ) => {
      const snap = { columns, rows };
      if (next.columns) setColumns(next.columns);
      if (next.rows) setRows(next.rows);
      start(async () => {
        try {
          await persist();
        } catch (e) {
          setColumns(snap.columns);
          setRows(snap.rows);
          toast({
            tone: "error",
            title: failTitle,
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [columns, rows, toast],
  );

  // --- Title ---------------------------------------------------------------

  const commitTitle = useCallback(
    (value: string) => {
      const trimmed = value.trim() || "Untitled";
      if (trimmed === title) return;
      const prev = title;
      setTitle(trimmed);
      start(async () => {
        try {
          await renameDatabase(databaseId, trimmed);
        } catch {
          setTitle(prev);
          toast({ tone: "error", title: "Couldn't rename the database" });
        }
      });
    },
    [title, databaseId, toast],
  );

  // --- Cells ---------------------------------------------------------------

  const setCell = useCallback(
    (rowId: string, colId: string, value: DbCellValue) => {
      mutate(
        {
          rows: rows.map((r) =>
            r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r,
          ),
        },
        () => updateCell(rowId, { colId, value }),
        "Couldn't save the cell",
      );
    },
    [rows, mutate],
  );

  // --- Rows ----------------------------------------------------------------

  const onAddRow = useCallback(() => {
    const snap = rows;
    start(async () => {
      try {
        const row = await addRow(databaseId);
        setRows((prev) => [...prev, row]);
        setFocusRowId(row.id);
      } catch (e) {
        setRows(snap);
        toast({
          tone: "error",
          title: "Couldn't add a row",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  }, [rows, databaseId, toast]);

  const onDeleteRow = useCallback(
    (id: string) => {
      mutate(
        { rows: rows.filter((r) => r.id !== id) },
        () => deleteRow(id),
        "Couldn't delete the row",
      );
    },
    [rows, mutate],
  );

  const performRowReorder = useCallback(
    (dragId: string, targetId: string, mode: DropMode) => {
      const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
      const without = ordered.filter((r) => r.id !== dragId);
      const ti = without.findIndex((r) => r.id === targetId);
      if (ti < 0) return;
      const beforeId =
        mode === "before" ? without[ti].id : (without[ti + 1]?.id ?? null);
      const plan = planRowReorder(ordered, dragId, beforeId);
      if (!plan) return;
      const orderById = new Map(plan.updates.map((u) => [u.id, u.sortOrder]));
      const nextRows = rows
        .map((r) => ({ ...r, sortOrder: orderById.get(r.id) ?? r.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      mutate(
        { rows: nextRows },
        () => reorderRow(dragId, { beforeId }),
        "Couldn't reorder the rows",
      );
    },
    [rows, mutate],
  );

  // --- Columns -------------------------------------------------------------

  const onAddColumn = useCallback(
    (type: DatabaseColumnType) => {
      const snap = columns;
      start(async () => {
        try {
          const col = await addColumn(databaseId, { type });
          setColumns((prev) => [...prev, col]);
          setOpenColMenu(col.id);
        } catch (e) {
          setColumns(snap);
          toast({
            tone: "error",
            title: "Couldn't add a column",
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [columns, databaseId, toast],
  );

  const setColumnName = useCallback(
    (colId: string, name: string) => {
      const cur = columns.find((c) => c.id === colId);
      if (!cur || cur.name === name) return;
      mutate(
        { columns: columns.map((c) => (c.id === colId ? { ...c, name } : c)) },
        () => updateColumn(databaseId, colId, { name }),
        "Couldn't rename the column",
      );
    },
    [columns, databaseId, mutate],
  );

  const setColumnType = useCallback(
    (colId: string, type: DatabaseColumnType) => {
      const cur = columns.find((c) => c.id === colId);
      if (!cur || cur.type === type) return;
      const nextCol: DatabaseColumn = { id: cur.id, name: cur.name, type };
      if (type === "select") nextCol.options = cur.options ?? [];
      const toOptions = type === "select" ? (nextCol.options ?? []) : [];
      const valueMap = retypeColumnValues(rows, cur, type, toOptions);
      const nextRows = rows.map((r) => ({
        ...r,
        values: { ...r.values, [colId]: valueMap[r.id] },
      }));
      mutate(
        {
          columns: columns.map((c) => (c.id === colId ? nextCol : c)),
          rows: nextRows,
        },
        () => updateColumn(databaseId, colId, { type }),
        "Couldn't change the column type",
      );
    },
    [columns, rows, databaseId, mutate],
  );

  const setColumnOptions = useCallback(
    (colId: string, nextOptions: SelectOption[]) => {
      const cur = columns.find((c) => c.id === colId);
      if (!cur) return;
      const valueMap = retypeColumnValues(rows, cur, "select", nextOptions);
      const nextRows = rows.map((r) => ({
        ...r,
        values: { ...r.values, [colId]: valueMap[r.id] },
      }));
      mutate(
        {
          columns: columns.map((c) =>
            c.id === colId ? { ...c, type: "select", options: nextOptions } : c,
          ),
          rows: nextRows,
        },
        () => updateColumn(databaseId, colId, { options: nextOptions }),
        "Couldn't update the options",
      );
    },
    [columns, rows, databaseId, mutate],
  );

  const onDeleteColumn = useCallback(
    (colId: string) => {
      setOpenColMenu(null);
      mutate(
        {
          columns: columns.filter((c) => c.id !== colId),
          rows: rows.map((r) => {
            const values = { ...r.values };
            delete values[colId];
            return { ...r, values };
          }),
        },
        () => deleteColumn(databaseId, colId),
        "Couldn't delete the column",
      );
    },
    [columns, rows, databaseId, mutate],
  );

  const performColumnReorder = useCallback(
    (dragId: string, targetId: string, mode: DropMode) => {
      const ids = columns.map((c) => c.id);
      const without = ids.filter((i) => i !== dragId);
      const ti = without.indexOf(targetId);
      if (ti < 0) return;
      const insertAt = mode === "before" ? ti : ti + 1;
      const nextIds = [
        ...without.slice(0, insertAt),
        dragId,
        ...without.slice(insertAt),
      ];
      const byId = new Map(columns.map((c) => [c.id, c]));
      const nextColumns = nextIds
        .map((i) => byId.get(i))
        .filter((c): c is DatabaseColumn => Boolean(c));
      mutate(
        { columns: nextColumns },
        () => reorderColumns(databaseId, nextIds),
        "Couldn't reorder the columns",
      );
    },
    [columns, databaseId, mutate],
  );

  const sortedRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="gv-db-table mt-4" data-testid="database-table">
      <input
        value={title}
        placeholder="Untitled"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={(e) => commitTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="Database title"
        className="text-foreground placeholder:text-faint mb-2 w-full max-w-md rounded-md bg-transparent px-1 text-base font-semibold outline-none"
      />

      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <div className="min-w-max">
          {/* Header */}
          <div className="border-border/60 bg-secondary/40 flex items-stretch border-b">
            <span className="w-7 shrink-0" aria-hidden />
            {columns.map((col) => (
              <HeaderCell
                key={col.id}
                column={col}
                open={openColMenu === col.id}
                isDragging={colDrag === col.id}
                dropMode={colDrop?.id === col.id ? colDrop.mode : null}
                onOpenChange={(o) => setOpenColMenu(o ? col.id : null)}
                onRename={(name) => setColumnName(col.id, name)}
                onRetype={(type) => setColumnType(col.id, type)}
                onOptionsChange={(opts) => setColumnOptions(col.id, opts)}
                onDelete={() => onDeleteColumn(col.id)}
                onDragStart={() => {
                  dragKind.current = "col";
                  colDragId.current = col.id;
                  setColDrag(col.id);
                }}
                onDragOver={(mode) => {
                  if (
                    dragKind.current !== "col" ||
                    !colDragId.current ||
                    colDragId.current === col.id
                  )
                    return;
                  setColDrop((p) =>
                    p && p.id === col.id && p.mode === mode ? p : { id: col.id, mode },
                  );
                }}
                onDrop={(mode) => {
                  const dragId = colDragId.current;
                  if (dragKind.current === "col" && dragId && dragId !== col.id) {
                    performColumnReorder(dragId, col.id, mode);
                  }
                  dragKind.current = null;
                  colDragId.current = null;
                  setColDrag(null);
                  setColDrop(null);
                }}
                onDragEnd={() => {
                  dragKind.current = null;
                  colDragId.current = null;
                  setColDrag(null);
                  setColDrop(null);
                }}
              />
            ))}
            <AddColumnButton onPick={onAddColumn} />
          </div>

          {/* Body */}
          {sortedRows.map((row) => (
            <RowView
              key={row.id}
              row={row}
              columns={columns}
              autoFocus={row.id === focusRowId}
              onFocused={() => setFocusRowId(null)}
              isDragging={rowDrag === row.id}
              dropMode={rowDrop?.id === row.id ? rowDrop.mode : null}
              onCellChange={(colId, value) => setCell(row.id, colId, value)}
              onManageOptions={(colId) => setOpenColMenu(colId)}
              onDelete={() => onDeleteRow(row.id)}
              onDragStart={() => {
                dragKind.current = "row";
                rowDragId.current = row.id;
                setRowDrag(row.id);
              }}
              onDragOver={(mode) => {
                if (
                  dragKind.current !== "row" ||
                  !rowDragId.current ||
                  rowDragId.current === row.id
                )
                  return;
                setRowDrop((p) =>
                  p && p.id === row.id && p.mode === mode ? p : { id: row.id, mode },
                );
              }}
              onDrop={(mode) => {
                const dragId = rowDragId.current;
                if (dragKind.current === "row" && dragId && dragId !== row.id) {
                  performRowReorder(dragId, row.id, mode);
                }
                dragKind.current = null;
                rowDragId.current = null;
                setRowDrag(null);
                setRowDrop(null);
              }}
              onDragEnd={() => {
                dragKind.current = null;
                rowDragId.current = null;
                setRowDrag(null);
                setRowDrop(null);
              }}
            />
          ))}

          {/* "+ New" row */}
          <button
            type="button"
            onClick={onAddRow}
            data-testid="db-add-row"
            className="text-faint hover:text-foreground hover:bg-foreground/[0.04] flex w-full items-center gap-1.5 px-2 py-2 text-sm transition-colors"
          >
            <Plus className="size-4" /> New
          </button>
        </div>
      </div>
    </div>
  );
}

/** The icon that stands for each column type in the header + type menu. */
function TypeIcon({
  type,
  className,
}: {
  type: DatabaseColumnType;
  className?: string;
}) {
  const Icon =
    type === "select"
      ? CircleDot
      : type === "date"
        ? Calendar
        : type === "checkbox"
          ? CheckSquare
          : type === "url"
            ? LinkIcon
            : Type;
  return <Icon className={className ?? "size-3.5"} aria-hidden />;
}

const TYPE_LABELS: Record<DatabaseColumnType, string> = {
  text: "Text",
  select: "Select",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
};

/** A drop indicator painted on the leading (before) or trailing (after) edge. */
function DropRail({ mode, axis }: { mode: DropMode | null; axis: "x" | "y" }) {
  if (!mode) return null;
  const base = "bg-brand pointer-events-none absolute z-10 rounded-full";
  if (axis === "y") {
    return (
      <span
        className={cn(
          base,
          "inset-x-0 h-0.5",
          mode === "before" ? "-top-px" : "-bottom-px",
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        base,
        "inset-y-0 w-0.5",
        mode === "before" ? "-left-px" : "-right-px",
      )}
    />
  );
}

/** One header cell: a type-icon drag handle, an inline-rename name, and a ▾ menu. */
function HeaderCell({
  column,
  open,
  isDragging,
  dropMode,
  onOpenChange,
  onRename,
  onRetype,
  onOptionsChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  column: DatabaseColumn;
  open: boolean;
  isDragging: boolean;
  dropMode: DropMode | null;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
  onRetype: (type: DatabaseColumnType) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (mode: DropMode) => void;
  onDrop: (mode: DropMode) => void;
  onDragEnd: () => void;
}) {
  const [draft, setDraft] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(column.name);
  }, [column.name]);

  const modeFor = (e: DragEvent<HTMLElement>): DropMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX - rect.left < rect.width / 2 ? "before" : "after";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(modeFor(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(modeFor(e));
      }}
      className={cn(
        "group/col border-border/60 relative flex shrink-0 items-center gap-1 border-r px-1.5 py-1.5 last:border-r-0",
        COL_W,
        isDragging && "opacity-40",
      )}
    >
      <DropRail mode={dropMode} axis="x" />

      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", column.id);
          } catch {
            // Some browsers reject setData outside a user drag; harmless.
          }
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-label="Drag to reorder column"
        title={TYPE_LABELS[column.type]}
        className="text-muted-foreground grid size-5 shrink-0 cursor-grab place-items-center rounded active:cursor-grabbing"
      >
        <TypeIcon type={column.type} />
      </button>

      <input
        ref={inputRef}
        value={draft}
        placeholder="Column"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onRename(draft.trim() || "Column")}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setDraft(column.name);
            e.currentTarget.blur();
          }
        }}
        className="text-foreground placeholder:text-faint min-w-0 flex-1 rounded bg-transparent px-0.5 text-sm font-medium outline-none"
      />

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Column options"
        className="text-faint hover:text-foreground hover:bg-foreground/10 grid size-5 shrink-0 place-items-center rounded opacity-0 transition-all group-hover/col:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <ChevronDown className="size-3.5" />
      </button>

      {open && (
        <ColumnMenu
          column={column}
          onClose={() => onOpenChange(false)}
          onRetype={onRetype}
          onOptionsChange={onOptionsChange}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

/**
 * The per-column settings popover — its own lightweight panel (NOT a base-ui
 * Menu), because it hosts text inputs for renaming options, which a menu's
 * keyboard nav would fight. A fixed backdrop closes it on an outside click.
 */
function ColumnMenu({
  column,
  onClose,
  onRetype,
  onOptionsChange,
  onDelete,
}: {
  column: DatabaseColumn;
  onClose: () => void;
  onRetype: (type: DatabaseColumnType) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  onDelete: () => void;
}) {
  const options = column.options ?? [];

  const addOption = () => {
    const used = new Set(options.map((o) => o.color));
    const color =
      (SELECT_COLORS.find((c) => !used.has(c.name))?.name as SelectColorName) ??
      SELECT_COLORS[options.length % SELECT_COLORS.length].name;
    onOptionsChange([
      ...options,
      { id: localId(), name: `Option ${options.length + 1}`, color },
    ]);
  };
  const renameOption = (id: string, name: string) =>
    onOptionsChange(options.map((o) => (o.id === id ? { ...o, name } : o)));
  const recolorOption = (id: string, color: SelectColorName) =>
    onOptionsChange(options.map((o) => (o.id === id ? { ...o, color } : o)));
  const removeOption = (id: string) =>
    onOptionsChange(options.filter((o) => o.id !== id));

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} aria-hidden />
      <div className="border-border bg-popover text-popover-foreground ring-foreground/10 absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border p-1 shadow-md ring-1">
        <div className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
          Type
        </div>
        {DATABASE_COLUMN_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onRetype(t)}
            className="hover:bg-foreground/10 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors"
          >
            <TypeIcon type={t} className="text-muted-foreground size-3.5" />
            <span className="flex-1 text-left">{TYPE_LABELS[t]}</span>
            {column.type === t && <Check className="text-brand size-3.5" />}
          </button>
        ))}

        {column.type === "select" && (
          <>
            <DropdownMenuSeparatorLine />
            <div className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
              Options
            </div>
            <div className="max-h-52 space-y-0.5 overflow-y-auto">
              {options.map((opt) => (
                <div key={opt.id} className="flex items-center gap-1 px-1">
                  <OptionColorMenu
                    color={opt.color}
                    onPick={(c) => recolorOption(opt.id, c)}
                  />
                  <input
                    defaultValue={opt.name}
                    placeholder="Option"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || "Option";
                      if (v !== opt.name) renameOption(opt.id, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="text-foreground placeholder:text-faint focus:bg-foreground/[0.05] min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(opt.id)}
                    aria-label="Remove option"
                    className="text-faint hover:text-destructive hover:bg-destructive/10 grid size-5 shrink-0 place-items-center rounded transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 mt-0.5 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors"
            >
              <Plus className="size-3.5" /> Add option
            </button>
          </>
        )}

        <DropdownMenuSeparatorLine />
        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete();
          }}
          className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors"
        >
          <Trash2 className="size-3.5" /> Delete column
        </button>
      </div>
    </>
  );
}

/** A thin divider matching the dropdown separator, usable outside a base-ui menu. */
function DropdownMenuSeparatorLine() {
  return <div className="bg-border -mx-1 my-1 h-px" aria-hidden />;
}

/** A colored-dot trigger that opens a base-ui menu of the palette swatches. */
function OptionColorMenu({
  color,
  onPick,
}: {
  color: SelectColorName;
  onPick: (color: SelectColorName) => void;
}) {
  const style = selectColorStyle(color);
  return (
    <DropdownMenu>
      <MenuPrimitive.Trigger
        aria-label="Option color"
        className="grid size-5 shrink-0 place-items-center rounded outline-none hover:opacity-80"
      >
        <span className={cn("size-3 rounded-full", style.dot)} aria-hidden />
      </MenuPrimitive.Trigger>
      <DropdownMenuContent align="start" className="w-36">
        {SELECT_COLORS.map((c) => (
          <DropdownMenuItem key={c.name} onClick={() => onPick(c.name)}>
            <span className={cn("size-2.5 rounded-full", c.dot)} aria-hidden />
            <span className="flex-1 capitalize">{c.name}</span>
            {color === c.name && <Check className="text-brand size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The "+" that adds a new column, choosing a type from a base-ui menu. */
function AddColumnButton({ onPick }: { onPick: (type: DatabaseColumnType) => void }) {
  return (
    <div className="flex shrink-0 items-center px-1">
      <DropdownMenu>
        <MenuPrimitive.Trigger
          aria-label="Add column"
          data-testid="db-add-column"
          className="text-faint hover:text-foreground hover:bg-foreground/10 grid size-6 place-items-center rounded transition-colors outline-none"
        >
          <Plus className="size-4" />
        </MenuPrimitive.Trigger>
        <DropdownMenuContent align="start" className="w-40">
          {DATABASE_COLUMN_TYPES.map((t) => (
            <DropdownMenuItem key={t} onClick={() => onPick(t)}>
              <TypeIcon type={t} className="text-muted-foreground size-3.5" />
              {TYPE_LABELS[t]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** One editable row: drag handle, one cell per column, delete. */
function RowView({
  row,
  columns,
  autoFocus,
  onFocused,
  isDragging,
  dropMode,
  onCellChange,
  onManageOptions,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  row: DatabaseRow;
  columns: DatabaseColumn[];
  autoFocus: boolean;
  onFocused: () => void;
  isDragging: boolean;
  dropMode: DropMode | null;
  onCellChange: (colId: string, value: DbCellValue) => void;
  onManageOptions: (colId: string) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (mode: DropMode) => void;
  onDrop: (mode: DropMode) => void;
  onDragEnd: () => void;
}) {
  const modeFor = (e: DragEvent<HTMLElement>): DropMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(modeFor(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(modeFor(e));
      }}
      className={cn(
        "group/row border-border/40 relative flex items-stretch border-b transition-colors last:border-b-0",
        isDragging && "opacity-40",
      )}
    >
      <DropRail mode={dropMode} axis="y" />

      <div className="flex w-7 shrink-0 items-center justify-center">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", row.id);
            } catch {
              // Harmless in browsers that reject setData outside a user drag.
            }
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          aria-label="Drag to reorder row"
          className="text-faint hover:text-muted-foreground grid size-5 cursor-grab place-items-center rounded opacity-0 transition-opacity group-hover/row:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      {columns.map((col, i) => (
        <div
          key={col.id}
          className={cn(
            "border-border/40 flex min-w-0 items-center border-r px-1.5 py-1 last:border-r-0",
            COL_W,
          )}
        >
          <Cell
            column={col}
            value={row.values[col.id]}
            autoFocus={autoFocus && i === 0}
            onFocused={onFocused}
            onChange={(v) => onCellChange(col.id, v)}
            onManageOptions={() => onManageOptions(col.id)}
          />
        </div>
      ))}

      <div className="flex w-8 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete row"
          title="Delete row"
          className="text-faint hover:text-destructive hover:bg-destructive/10 grid size-6 place-items-center rounded opacity-0 transition-all group-hover/row:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Dispatch a cell to the editor for its column type. */
function Cell({
  column,
  value,
  autoFocus,
  onFocused,
  onChange,
  onManageOptions,
}: {
  column: DatabaseColumn;
  value: DbCellValue | undefined;
  autoFocus: boolean;
  onFocused: () => void;
  onChange: (value: DbCellValue) => void;
  onManageOptions: () => void;
}) {
  switch (column.type) {
    case "checkbox":
      return <CheckboxCell value={value === true} onChange={onChange} />;
    case "select":
      return (
        <SelectCell
          column={column}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
          onManageOptions={onManageOptions}
        />
      );
    case "date":
      return (
        <DateCell
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      );
    case "url":
      return (
        <UrlCell value={typeof value === "string" ? value : ""} onChange={onChange} />
      );
    case "text":
    default:
      return (
        <TextCell
          value={typeof value === "string" ? value : ""}
          autoFocus={autoFocus}
          onFocused={onFocused}
          onChange={onChange}
        />
      );
  }
}

/** Inline text cell: commits on blur / Enter, reverts on Escape. */
function TextCell({
  value,
  autoFocus,
  onFocused,
  onChange,
}: {
  value: string;
  autoFocus?: boolean;
  onFocused?: () => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      onFocused?.();
    }
  }, [autoFocus, onFocused]);
  return (
    <input
      ref={ref}
      value={draft}
      placeholder="Empty"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="text-foreground placeholder:text-faint/70 focus:bg-foreground/[0.04] min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}

/** URL cell: a real link that opens in a new tab, with a hover edit affordance. */
function UrlCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing && value) {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand decoration-brand/40 hover:decoration-brand min-w-0 flex-1 truncate text-sm underline underline-offset-2"
        >
          {value}
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit URL"
          className="text-faint hover:text-foreground grid size-5 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover/row:opacity-100"
        >
          <Pencil className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <input
      ref={ref}
      value={draft}
      placeholder="Add link"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="text-foreground placeholder:text-faint/70 focus:bg-foreground/[0.04] min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}

/** Compact date cell: shows "Mon D" when set, a calendar affordance when not. */
function DateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        onBlur={() => setEditing(false)}
        className="text-foreground border-border/60 bg-card w-full rounded-md border px-1 py-0.5 text-xs outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "flex items-center gap-1 rounded-md px-1 py-1 text-xs transition-colors",
        value
          ? "text-muted-foreground hover:bg-foreground/[0.06]"
          : "text-faint hover:text-muted-foreground",
      )}
    >
      {value ? (
        formatCompactDate(value)
      ) : (
        <Calendar className="size-3.5" aria-label="Set date" />
      )}
    </button>
  );
}

/** A real checkbox cell. */
function CheckboxCell({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
      aria-label="Toggle"
      className="border-border text-brand focus-visible:ring-brand/40 size-4 cursor-pointer rounded outline-none focus-visible:ring-2"
    />
  );
}

/** The colored select pill + its base-ui menu of options — like the To-Do status. */
function SelectCell({
  column,
  value,
  onChange,
  onManageOptions,
}: {
  column: DatabaseColumn;
  value: string | null;
  onChange: (value: string | null) => void;
  onManageOptions: () => void;
}) {
  const options = column.options ?? [];
  const current =
    value && isKnownOption(column, value)
      ? options.find((o) => o.id === value)
      : undefined;
  const style = current ? selectColorStyle(current.color) : null;

  return (
    <DropdownMenu>
      <MenuPrimitive.Trigger
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity outline-none hover:opacity-80",
          current && style ? style.chip : "text-faint hover:text-muted-foreground",
        )}
      >
        {current && style ? (
          <>
            <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
            <span className="truncate">{current.name}</span>
          </>
        ) : (
          "Empty"
        )}
      </MenuPrimitive.Trigger>
      <DropdownMenuContent align="start" className="w-52">
        {options.length === 0 && (
          <div className="text-faint px-1.5 py-1 text-xs">No options yet</div>
        )}
        {options.map((opt) => {
          const os = selectColorStyle(opt.color);
          return (
            <DropdownMenuItem key={opt.id} onClick={() => onChange(opt.id)}>
              <span className={cn("size-2 rounded-full", os.dot)} aria-hidden />
              <span className="flex-1 truncate">{opt.name}</span>
              {value === opt.id && <Check className="text-brand size-3.5" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {value && (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <X className="text-muted-foreground size-3.5" /> Clear
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onManageOptions}>
          <Pencil className="text-muted-foreground size-3.5" /> Edit options
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Format `yyyy-mm-dd` as a compact "Mon D" without any timezone drift. */
function formatCompactDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (!m || !d || m < 1 || m > 12) return iso;
  return `${months[m - 1]} ${d}`;
}
