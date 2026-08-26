"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";

import {
  assignWorkItem,
  createWorkItem,
  setWorkItemStatus,
} from "@/app/(app)/team/work/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { WorkItem, WorkMember } from "@/lib/work/queries";
import { cn } from "@/lib/utils";

export interface ClientOption {
  id: string;
  name: string;
  slug: string;
  accent: string;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string; next: string }
> = {
  not_started: {
    label: "To do",
    dot: "bg-faint",
    text: "text-muted-foreground",
    next: "in_progress",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-warning",
    text: "text-warning",
    next: "completed",
  },
  completed: {
    label: "Done",
    dot: "bg-success",
    text: "text-success",
    next: "not_started",
  },
};

function StatusButton({
  status,
  onCycle,
  disabled,
}: {
  status: string;
  onCycle: () => void;
  disabled: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.not_started;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCycle}
      title="Click to advance status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        meta.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </button>
  );
}

export function WorkBoard({
  items,
  members,
  clients,
}: {
  items: WorkItem[];
  members: WorkMember[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [due, setDue] = useState("");

  const act = (fn: () => Promise<unknown>, onOk?: () => void) =>
    start(async () => {
      try {
        await fn();
        onOk?.();
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });

  function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    act(
      () =>
        createWorkItem({
          title,
          clientId: clientId || null,
          assigneeId: assigneeId || null,
          dueDate: due || null,
        }),
      () => {
        setTitle("");
        setDue("");
        toast({ tone: "success", title: "Work added" });
      },
    );
  }

  // Group by client (null clientId → agency), preserving the roster order and
  // always showing an offer even with no open work — that's the "how's it
  // going per client" read.
  const byClient = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const it of items) {
      const key = it.clientId ?? "agency";
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return map;
  }, [items]);

  const groups: { id: string; name: string; accent: string; items: WorkItem[] }[] = [
    ...clients.map((c) => ({
      id: c.id,
      name: c.name,
      accent: c.accent,
      items: byClient.get(c.id) ?? [],
    })),
    {
      id: "agency",
      name: "Agency — no client",
      accent: "var(--brand)",
      items: byClient.get("agency") ?? [],
    },
  ].filter((g) => g.items.length > 0 || g.id !== "agency");

  const open = items.filter((i) => i.status !== "completed").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const done = items.filter((i) => i.status === "completed").length;

  const count = (list: WorkItem[], status: string) =>
    list.filter((i) => i.status === status).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel>
          <p className="text-muted-foreground text-xs">Open work</p>
          <p className="numeric mt-0.5 text-2xl font-bold">{open}</p>
        </Panel>
        <Panel>
          <p className="text-muted-foreground text-xs">In progress</p>
          <p className="numeric text-warning mt-0.5 text-2xl font-bold">{inProgress}</p>
        </Panel>
        <Panel>
          <p className="text-muted-foreground text-xs">Done</p>
          <p className="numeric text-success mt-0.5 text-2xl font-bold">{done}</p>
        </Panel>
      </div>

      {/* Add work */}
      <Panel title="Add work">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Task</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Rewrite the Vault VSL hook"'
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Client</span>
            <select
              className={cn(selectClass, "w-40")}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Agency</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Owner</span>
            <select
              className={cn(selectClass, "w-36")}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
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
          <Button type="submit" disabled={pending || !title.trim()} className="gap-2">
            <Plus className="size-3.5" /> Add
          </Button>
        </form>
      </Panel>

      {groups.length === 0 ? (
        <Panel title="No work yet">
          <p className="text-faint py-8 text-center text-sm">
            Add work above, or it flows in from the agency task board and call notes.
          </p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Panel
              key={g.id}
              title={g.name}
              aside={
                <span className="text-faint text-xs">
                  {count(g.items, "not_started")} to do ·{" "}
                  {count(g.items, "in_progress")} in progress ·{" "}
                  {count(g.items, "completed")} done
                </span>
              }
            >
              {g.items.length === 0 ? (
                <p className="text-faint py-3 text-center text-sm">No open work.</p>
              ) : (
                <div className="space-y-1.5">
                  {g.items.map((it) => (
                    <div
                      key={it.id}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-2.5",
                        it.status === "completed" && "opacity-60",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: g.accent }}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          it.status === "completed" && "line-through",
                        )}
                      >
                        {it.title}
                      </span>
                      {it.dueDate && (
                        <span className="text-faint text-[11px] whitespace-nowrap">
                          due{" "}
                          {new Date(`${it.dueDate}T12:00:00Z`).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      )}
                      <select
                        className={cn(selectClass, "h-8 w-32")}
                        value={it.assigneeId ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          act(() => assignWorkItem(it.id, e.target.value || null))
                        }
                        aria-label="Assign"
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <StatusButton
                        status={it.status}
                        disabled={pending}
                        onCycle={() =>
                          act(() =>
                            setWorkItemStatus(
                              it.id,
                              STATUS_META[it.status]?.next ?? "in_progress",
                            ),
                          )
                        }
                      />
                      {it.status === "completed" && (
                        <Check className="text-success size-3.5 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
