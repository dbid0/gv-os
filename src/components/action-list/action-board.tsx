"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Plus, User, X } from "lucide-react";

import {
  createActionItem,
  deleteActionItem,
  setActionStatus,
} from "@/app/(app)/action-list/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import type { ActionItemRow } from "@/lib/action-list";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

const CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const COLUMNS = [
  { key: "not_started", label: "Not started", dot: "bg-faint" },
  { key: "in_progress", label: "In progress", dot: "bg-brand" },
  { key: "completed", label: "Completed", dot: "bg-success" },
] as const;

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const fmtDate = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

function Card({ item }: { item: ActionItemRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const due = fmtDate(item.dueDate);

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="bg-card group space-y-2.5 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug">{item.title}</p>
        <button
          aria-label="Delete"
          disabled={pending}
          onClick={() => act(() => deleteActionItem(item.id))}
          className="text-faint hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="text-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {due && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" /> {due}
          </span>
        )}
        {item.assignee && (
          <span className="inline-flex items-center gap-1">
            <User className="size-3" /> {item.assignee}
          </span>
        )}
        <span
          className={cn(
            "rounded-full border px-1.5",
            item.teamName ? "text-muted-foreground" : "border-brand/30 text-brand",
          )}
        >
          {item.teamName ?? "Agency"}
        </span>
      </div>

      <div className="flex gap-1">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            disabled={pending || item.status === c.key}
            onClick={() => act(() => setActionStatus(item.id, c.key))}
            className={cn(
              "flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
              item.status === c.key
                ? "border-border-strong bg-secondary text-foreground font-medium"
                : "text-faint hover:text-foreground hover:bg-secondary/60",
            )}
          >
            {c.label.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActionBoard({
  items,
  teams,
}: {
  items: ActionItemRow[];
  teams: TeamOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cadence, setCadence] = useState("daily");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [scope, setScope] = useState("");

  const forCadence = useMemo(
    () => items.filter((i) => i.cadence === cadence),
    [items, cadence],
  );

  function add() {
    if (title.trim() === "") return;
    start(async () => {
      await createActionItem({
        title,
        cadence: cadence as "daily" | "weekly" | "monthly",
        dueDate: due || undefined,
        assignee: assignee || undefined,
        clientId: scope || null,
      });
      setTitle("");
      setDue("");
      setAssignee("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Action list</h1>
          <p className="text-muted-foreground text-sm">
            What the team is moving on — daily, weekly, and monthly.
          </p>
        </div>
        <Segmented
          ariaLabel="Cadence"
          value={cadence}
          onChange={setCadence}
          segments={CADENCES}
        />
      </div>

      <Panel title={`Add a ${cadence} action`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[16rem] flex-1 space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Action</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="What needs to happen"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Due</span>
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-40"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Assignee</span>
            <Input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Name"
              className="w-36"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Scope</span>
            <select
              className={cn(selectClass, "w-40")}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">Agency (Daniel + Gus)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={add}
            disabled={pending || title.trim() === ""}
            className="gap-2"
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const cards = forCadence.filter((i) => i.status === col.key);
          return (
            <div
              key={col.key}
              className="bg-secondary/30 space-y-3 rounded-xl border p-3"
            >
              <div className="flex items-center gap-2 px-1">
                <span className={cn("size-1.5 rounded-full", col.dot)} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-faint text-xs">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <p className="text-faint px-1 py-6 text-center text-xs">
                    Nothing here
                  </p>
                ) : (
                  cards.map((item) => <Card key={item.id} item={item} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
