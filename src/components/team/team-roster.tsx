"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ListChecks, Mail, Plus } from "lucide-react";

import { createTeamMember, setTeamMemberStatus } from "@/app/(app)/team/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import type { TeamMemberRow } from "@/lib/team";
import { TEAM_ROLES, roleLabel, roleRank, type TeamRole } from "@/lib/team-roles";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function MemberRow({ member }: { member: TeamMemberRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inactive = member.status !== "active";

  function toggle() {
    start(async () => {
      await setTeamMemberStatus(member.id, inactive ? "active" : "inactive");
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3",
        inactive && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.name}</p>
        <p className="text-faint flex flex-wrap items-center gap-x-3 text-[11px]">
          <span>{roleLabel(member.role)}</span>
          {member.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3" /> {member.email}
            </span>
          )}
        </p>
      </div>

      <span
        className={cn(
          "rounded-full border px-1.5 text-[11px]",
          member.clientName ? "text-muted-foreground" : "border-brand/30 text-brand",
        )}
      >
        {member.clientName ?? "Agency"}
      </span>

      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <ListChecks className="size-3.5" />
        {member.openActions} open
      </span>

      <button
        disabled={pending}
        onClick={toggle}
        className="text-faint hover:text-foreground rounded-md border px-2 py-1 text-[11px] transition-colors"
      >
        {inactive ? "Reactivate" : "Deactivate"}
      </button>
    </div>
  );
}

export function TeamRoster({
  members,
  teams,
}: {
  members: TeamMemberRow[];
  teams: TeamOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [role, setRole] = useState<TeamRole>("copywriter");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("");

  const active = members.filter((m) => m.status === "active");

  const byRole = useMemo(() => {
    const sorted = [...members].sort(
      (a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name),
    );
    const groups = new Map<string, TeamMemberRow[]>();
    for (const m of sorted) {
      const list = groups.get(m.role) ?? [];
      list.push(m);
      groups.set(m.role, list);
    }
    return [...groups.entries()];
  }, [members]);

  function add() {
    if (name.trim() === "") return;
    start(async () => {
      await createTeamMember({
        name,
        role,
        email: email || "",
        clientId: scope || null,
      });
      setName("");
      setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="team."
        description="Everyone who runs out of GV OS — who they are, whose lane they work, and what they're carrying. Assign actions to members on the action list; their boards build from here."
        status={<StatusPill tone="live">{active.length} active</StatusPill>}
      />

      <Panel title="Add a team member">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Full name"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Role</span>
            <select
              className={cn(selectClass, "w-44")}
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
            >
              {TEAM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
              className="w-52"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Lane</span>
            <select
              className={cn(selectClass, "w-40")}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">Agency-wide</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={add}
            disabled={pending || name.trim() === ""}
            className="gap-2"
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </Panel>

      {members.length === 0 ? (
        <Panel title="Roster">
          <p className="text-faint py-8 text-center text-sm">
            No team members yet. Add the crew above — copywriter, VA, creative director
            — and the action list picks them up as assignees.
          </p>
        </Panel>
      ) : (
        byRole.map(([roleKey, list]) => (
          <div key={roleKey} className="space-y-2">
            <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
              {roleLabel(roleKey)}s
            </h2>
            <div className="space-y-2">
              {list.map((m) => (
                <MemberRow key={m.id} member={m} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
