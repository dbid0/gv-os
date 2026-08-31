"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Calendar, GripVertical, Plus, Trash2 } from "lucide-react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import {
  addTodo,
  deleteTodo,
  reorderTodo,
  updateTodo,
} from "@/app/(app)/workspace/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import {
  applyTodoReorder,
  planTodoReorder,
  TODO_STATUSES,
  type TodoRow,
  type TodoStatus,
} from "@/lib/workspace/todos";
import { linkifyTaskText } from "@/lib/workspace/links";
import { cn } from "@/lib/utils";

/**
 * The interactive To-Do database on a teamspace's Home — the real, editable
 * mirror of the Notion "To-Do List". Click a status pill to change it, edit a
 * task inline, set a due date, drag rows to reorder, add a row, delete a row;
 * every change persists through the workspace server actions.
 *
 * State lives here, seeded from `initialTodos` (a server query on the Home's
 * parent). Every mutation is OPTIMISTIC — the UI updates immediately, then the
 * action persists; a failure reverts to the pre-change snapshot and toasts. The
 * drag reorder runs the exact same pure `planTodoReorder` the server does, so
 * the optimistic order and the persisted order never disagree.
 */

/** How each status paints its pill — a colored dot + tinted chip, Notion-style. */
const STATUS_STYLES: Record<TodoStatus, { chip: string; dot: string }> = {
  "Not started": {
    chip: "bg-secondary text-muted-foreground",
    dot: "bg-faint",
  },
  "In progress": {
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  Done: {
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
};

/** Where a drop lands relative to the row it is over. */
type DropMode = "before" | "after";
type DropHint = { id: string; mode: DropMode };

export function TodoDatabase({
  clientId,
  initialTodos,
  resolvePageId,
  onNavigate,
}: {
  /** The teamspace this board belongs to (null = the agency board). */
  clientId: string | null;
  /** Server-loaded rows, in board order — the seed for local state. */
  initialTodos: TodoRow[];
  /**
   * Resolve a sheet title to a page id within this teamspace, so a task like
   * "Fill out Software Logins" renders that sheet name as a link. Omitted when
   * the board is rendered outside a workspace (nothing linkifies).
   */
  resolvePageId?: (title: string) => string | null;
  /** Navigate the workspace to a page id when a task's sheet link is clicked. */
  onNavigate?: (pageId: string) => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TodoRow[]>(initialTodos);
  const [, start] = useTransition();
  const [focusId, setFocusId] = useState<string | null>(null);

  // Re-seed from the server whenever a fresh initial list arrives (a route
  // refresh), but never clobber optimistic local edits mid-flight.
  const initialRef = useRef(initialTodos);
  useEffect(() => {
    if (initialRef.current === initialTodos) return;
    initialRef.current = initialTodos;
    setRows(initialTodos);
  }, [initialTodos]);

  // Drag state. The active id is a ref so the hot dragover handler reads it live.
  const dragIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  /** Run an optimistic mutation: apply `next`, persist, revert on failure. */
  const mutate = useCallback(
    (next: TodoRow[], persist: () => Promise<unknown>, failTitle: string) => {
      const snapshot = rows;
      setRows(next);
      start(async () => {
        try {
          await persist();
        } catch (e) {
          setRows(snapshot);
          toast({
            tone: "error",
            title: failTitle,
            detail: e instanceof Error ? e.message : undefined,
          });
        }
      });
    },
    [rows, toast],
  );

  const setTask = useCallback(
    (id: string, task: string) => {
      const cur = rows.find((r) => r.id === id);
      if (!cur || cur.task === task) return;
      mutate(
        rows.map((r) => (r.id === id ? { ...r, task } : r)),
        () => updateTodo(id, { task }),
        "Couldn't save the task",
      );
    },
    [rows, mutate],
  );

  const setStatus = useCallback(
    (id: string, status: TodoStatus) => {
      mutate(
        rows.map((r) => (r.id === id ? { ...r, status } : r)),
        () => updateTodo(id, { status }),
        "Couldn't change the status",
      );
    },
    [rows, mutate],
  );

  const setDueDate = useCallback(
    (id: string, dueDate: string | null) => {
      const cur = rows.find((r) => r.id === id);
      if (!cur || cur.dueDate === dueDate) return;
      mutate(
        rows.map((r) => (r.id === id ? { ...r, dueDate } : r)),
        () => updateTodo(id, { dueDate }),
        "Couldn't set the date",
      );
    },
    [rows, mutate],
  );

  const removeTodo = useCallback(
    (id: string) => {
      mutate(
        rows.filter((r) => r.id !== id),
        () => deleteTodo(id),
        "Couldn't delete the task",
      );
    },
    [rows, mutate],
  );

  const addRow = useCallback(() => {
    const snapshot = rows;
    start(async () => {
      try {
        const row = await addTodo(clientId);
        setRows((prev) => [...prev, row]);
        setFocusId(row.id);
      } catch (e) {
        setRows(snapshot);
        toast({
          tone: "error",
          title: "Couldn't add a task",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  }, [rows, clientId, toast]);

  // --- Drag and drop ------------------------------------------------------

  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
    setDragId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setDropHint(null);
  }, []);

  const performReorder = useCallback(
    (draggingId: string, targetId: string, mode: DropMode) => {
      const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
      const withoutDragged = ordered.filter((r) => r.id !== draggingId);
      const targetIdx = withoutDragged.findIndex((r) => r.id === targetId);
      if (targetIdx < 0) return;
      const beforeId =
        mode === "before"
          ? withoutDragged[targetIdx].id
          : (withoutDragged[targetIdx + 1]?.id ?? null);

      const plan = planTodoReorder(ordered, draggingId, beforeId);
      if (!plan) return;

      mutate(
        applyTodoReorder(rows, plan),
        () => reorderTodo(draggingId, { beforeId }),
        "Couldn't reorder the tasks",
      );
    },
    [rows, mutate],
  );

  const handleDrop = useCallback(
    (targetId: string, mode: DropMode) => {
      const draggingId = dragIdRef.current;
      if (draggingId && draggingId !== targetId) {
        performReorder(draggingId, targetId, mode);
      }
      handleDragEnd();
    },
    [performReorder, handleDragEnd],
  );

  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mt-4">
      {/* Column header, matching the old static table. */}
      <div className="border-border/60 text-muted-foreground flex items-center border-b pb-2 text-sm font-medium">
        <span className="w-5 shrink-0" aria-hidden />
        <span className="flex-1">Task</span>
        <span className="w-[92px] shrink-0 pl-2">Due</span>
        <span className="w-[116px] shrink-0 pl-2">Status</span>
        <span className="w-6 shrink-0" aria-hidden />
      </div>

      <div>
        {sorted.map((row) => (
          <TodoRowView
            key={row.id}
            row={row}
            isDragging={dragId === row.id}
            dropMode={dropHint?.id === row.id ? dropHint.mode : null}
            autoFocus={row.id === focusId}
            resolvePageId={resolvePageId}
            onNavigate={onNavigate}
            onFocused={() => setFocusId(null)}
            onTaskChange={(task) => setTask(row.id, task)}
            onStatusChange={(status) => setStatus(row.id, status)}
            onDueDateChange={(d) => setDueDate(row.id, d)}
            onDelete={() => removeTodo(row.id)}
            onDragStart={() => handleDragStart(row.id)}
            onDragOver={(mode) => {
              if (!dragIdRef.current || dragIdRef.current === row.id) return;
              setDropHint((prev) =>
                prev && prev.id === row.id && prev.mode === mode
                  ? prev
                  : { id: row.id, mode },
              );
            }}
            onDrop={(mode) => handleDrop(row.id, mode)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* "+ New" row — always present, even on an empty board. */}
      <button
        type="button"
        onClick={addRow}
        className="text-faint hover:text-foreground hover:bg-foreground/[0.04] mt-1 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm transition-colors"
      >
        <Plus className="size-4" /> New
      </button>
    </div>
  );
}

/** One editable To-Do row: drag handle, task, due date, status pill, delete. */
function TodoRowView({
  row,
  isDragging,
  dropMode,
  autoFocus,
  resolvePageId,
  onNavigate,
  onFocused,
  onTaskChange,
  onStatusChange,
  onDueDateChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  row: TodoRow;
  isDragging: boolean;
  dropMode: DropMode | null;
  autoFocus: boolean;
  resolvePageId?: (title: string) => string | null;
  onNavigate?: (pageId: string) => void;
  onFocused: () => void;
  onTaskChange: (task: string) => void;
  onStatusChange: (status: TodoStatus) => void;
  onDueDateChange: (dueDate: string | null) => void;
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
        "group/todo border-border/40 relative flex items-center border-b transition-colors last:border-0",
        isDragging && "opacity-40",
      )}
    >
      {dropMode === "before" && (
        <span className="bg-brand pointer-events-none absolute inset-x-0 -top-px z-10 h-0.5 rounded-full" />
      )}
      {dropMode === "after" && (
        <span className="bg-brand pointer-events-none absolute inset-x-0 -bottom-px z-10 h-0.5 rounded-full" />
      )}

      {/* Drag handle — a real drag source, shown on row hover. */}
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", row.id);
          } catch {
            // Some browsers reject setData outside a user drag; harmless.
          }
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-label="Drag to reorder"
        className="text-faint hover:text-muted-foreground grid size-5 shrink-0 cursor-grab place-items-center rounded opacity-0 transition-opacity group-hover/todo:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>

      <TaskCell
        value={row.task}
        autoFocus={autoFocus}
        resolvePageId={resolvePageId}
        onNavigate={onNavigate}
        onFocused={onFocused}
        onCommit={onTaskChange}
      />

      <div className="w-[92px] shrink-0 py-1.5 pl-2">
        <DueDateCell value={row.dueDate} onChange={onDueDateChange} />
      </div>

      <div className="w-[116px] shrink-0 py-1.5 pl-2">
        <StatusCell status={row.status} onChange={onStatusChange} />
      </div>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete task"
        title="Delete task"
        className="text-faint hover:text-destructive hover:bg-destructive/10 grid size-6 shrink-0 place-items-center rounded opacity-0 transition-all group-hover/todo:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Inline-editable task text. When the task references a resolvable teamspace
 * sheet ("Fill out Software Logins"), it renders that span as a Notion-style
 * link (click it → navigate) while the rest of the text stays a normal click
 * target: clicking anywhere off the link drops into the plain `<input>` to edit,
 * saving on blur/Enter. A task with no resolvable sheet is always the input, so
 * ordinary rows behave exactly as before.
 */
function TaskCell({
  value,
  autoFocus,
  resolvePageId,
  onNavigate,
  onFocused,
  onCommit,
}: {
  value: string;
  autoFocus: boolean;
  resolvePageId?: (title: string) => string | null;
  onNavigate?: (pageId: string) => void;
  onFocused: () => void;
  onCommit: (task: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in step when the row's value changes underneath us (a server
  // re-seed), but only while this cell is not the one being edited.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setEditing(true);
      inputRef.current.focus();
      onFocused();
    }
  }, [autoFocus, onFocused]);

  // Focus the input the frame it appears when the user clicks into a linkified
  // row to edit it (the input isn't mounted until `editing` flips).
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const linkified =
    resolvePageId && onNavigate ? linkifyTaskText(value, resolvePageId) : null;

  // A linkified row shows its rendered text (with the sheet link) until the user
  // clicks off the link to edit; then it becomes the plain input.
  if (linkified && !editing) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        className="text-foreground min-w-0 flex-1 cursor-text truncate rounded-md px-1.5 py-1.5 text-sm outline-none"
      >
        {linkified.before}
        <button
          type="button"
          onClick={(e) => {
            // Navigate, and don't let the click fall through to edit mode.
            e.stopPropagation();
            onNavigate?.(linkified.link.pageId);
          }}
          className="gv-todo-sheet-link text-brand decoration-brand/40 hover:decoration-brand cursor-pointer rounded font-medium underline underline-offset-2 transition-colors"
        >
          {linkified.link.text}
        </button>
        {linkified.after}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      placeholder="Untitled"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onCommit(draft);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          inputRef.current?.blur();
        }
      }}
      className="text-foreground placeholder:text-faint focus:bg-foreground/[0.04] min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-sm outline-none"
    />
  );
}

/** The status pill + its dropdown of the three options with colour dots. */
function StatusCell({
  status,
  onChange,
}: {
  status: TodoStatus;
  onChange: (status: TodoStatus) => void;
}) {
  const style = STATUS_STYLES[status];
  return (
    <DropdownMenu>
      <DropdownMenuTriggerPill className={style.chip}>
        <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
        {status}
      </DropdownMenuTriggerPill>
      <DropdownMenuContent align="start" className="w-44">
        {TODO_STATUSES.map((option) => (
          <DropdownMenuItem key={option} onClick={() => onChange(option)}>
            <span
              className={cn("size-2 rounded-full", STATUS_STYLES[option].dot)}
              aria-hidden
            />
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The pill that opens the status menu — a `Menu.Trigger` styled as a real
 * status chip, so clicking it opens the options without nesting a button in a
 * button.
 */
function DropdownMenuTriggerPill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <MenuPrimitive.Trigger
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity outline-none hover:opacity-80 focus-visible:opacity-80",
        className,
      )}
    >
      {children}
    </MenuPrimitive.Trigger>
  );
}

/** Compact due-date cell: shows "Aug 30" when set, a calendar affordance when not. */
function DueDateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dueDate: string | null) => void;
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
          : "text-faint hover:text-muted-foreground opacity-0 group-hover/todo:opacity-100",
      )}
    >
      {value ? (
        formatCompactDate(value)
      ) : (
        <Calendar className="size-3.5" aria-label="Set due date" />
      )}
    </button>
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
