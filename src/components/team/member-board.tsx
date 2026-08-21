"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, CalendarDays, Eye } from "lucide-react";

import { setActionStatus } from "@/app/(app)/action-list/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import type { MemberActionRow } from "@/lib/team";
import { roleLabel } from "@/lib/team-roles";
import { cn } from "@/lib/utils";

interface MemberOption {
  id: string;
  name: string;
  role: string;
}

interface Member {
  id: string;
  name: string;
  role: string;
  email: string | null;
  status: string;
  clientName: string | null;
  notes: string | null;
}

const CADENCES = ["daily", "weekly", "monthly"] as const;

const COLUMNS = [
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
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

function ItemRow({ item }: { item: MemberActionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const due = fmtDate(item.dueDate);

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            item.status === "completed" && "text-faint line-through",
          )}
        >
          {item.title}
        </p>
        <p className="text-faint flex flex-wrap items-center gap-x-3 text-[11px]">
          {due && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" /> {due}
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
        </p>
      </div>
      <div className="flex gap-1">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            disabled={pending || item.status === c.key}
            onClick={() =>
              start(async () => {
                await setActionStatus(item.id, c.key);
                router.refresh();
              })
            }
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] transition-colors",
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

export function MemberBoard({
  member,
  items,
  members,
}: {
  member: Member;
  items: MemberActionRow[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const open = items.filter((i) => i.status !== "completed").length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title={member.name.split(" ")[0]}
        highlight="'s board."
        description={`${roleLabel(member.role)} · ${member.clientName ?? "Agency-wide"} lane. This is exactly what ${member.name.split(" ")[0]} sees: their assigned actions, nothing else. Assign more from the action list.`}
        status={
          <StatusPill tone={open > 0 ? "live" : "muted"}>
            {open} open {open === 1 ? "action" : "actions"}
          </StatusPill>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/team"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <ArrowLeft className="size-4" /> Roster
            </Link>
            <label className="inline-flex items-center gap-2">
              <Eye className="text-faint size-4" />
              <select
                aria-label="View as"
                className={cn(selectClass, "w-44")}
                value={member.id}
                onChange={(e) => router.push(`/team/${e.target.value}`)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {roleLabel(m.role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {items.length === 0 ? (
        <Panel title="Nothing assigned">
          <p className="text-faint py-8 text-center text-sm">
            No actions assigned to {member.name} yet. Add one on the action list and
            pick them as the assignee.
          </p>
        </Panel>
      ) : (
        CADENCES.map((cadence) => {
          const forCadence = items.filter((i) => i.cadence === cadence);
          if (forCadence.length === 0) return null;
          return (
            <div key={cadence} className="space-y-2">
              <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
                {cadence}
              </h2>
              <div className="space-y-2">
                {forCadence.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
