"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Link2, Mail, Plus, Search } from "lucide-react";

import { createTeamMember, setTeamMemberStatus } from "@/app/(app)/team/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import type { TeamMemberRow } from "@/lib/team";
import {
  MEMBER_SUBTYPES,
  PLATFORM_ROLES,
  REP_KINDS,
  type MemberSubtype,
  type PlatformRole,
  type RepKind,
  memberRoleLabel,
  platformRoleOf,
} from "@/lib/team-roles";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// A person gets one consistent colour from their name — purely decorative, so
// the roster reads as faces, not a spreadsheet. Static (no runtime cost).
const AVATAR_COLORS = [
  "#52b7ff",
  "#9b6bff",
  "#2dd4bf",
  "#f59e0b",
  "#f472b6",
  "#4ade80",
  "#60a5fa",
  "#fb7185",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}

function Avatar({ name }: { name: string }) {
  const c = avatarColor(name);
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${c} 16%, transparent)`,
        color: c,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 34%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-grad rounded-lg border p-3">
      <p className="numeric text-2xl font-bold">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  );
}

function StatusToggle({ member }: { member: TeamMemberRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const inactive = member.status !== "active";

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setTeamMemberStatus(member.id, inactive ? "active" : "inactive");
            router.refresh();
          } catch (e) {
            toast({
              tone: "error",
              title: e instanceof Error ? e.message : "Action failed.",
            });
          }
        })
      }
      className="text-faint hover:text-foreground rounded-md border px-2 py-1 text-[11px] transition-colors"
    >
      {inactive ? "Reactivate" : "Deactivate"}
    </button>
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
  const { toast } = useToast();
  const [pending, start] = useTransition();

  // Add form
  const [name, setName] = useState("");
  const [platformRole, setPlatformRole] = useState<PlatformRole>("sales_rep");
  const [repKind, setRepKind] = useState<RepKind>("closer");
  const [subtype, setSubtype] = useState<MemberSubtype>("copywriter");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | PlatformRole>("all");
  const [laneFilter, setLaneFilter] = useState("all");

  const active = members.filter((m) => m.status === "active");
  const salesReps = active.filter((m) => platformRoleOf(m) === "sales_rep").length;
  const delivery = active.filter((m) => platformRoleOf(m) === "team_member").length;
  const lanes = new Set(active.map((m) => m.clientName ?? "Agency")).size;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...members]
      .filter((m) => {
        if (q && !m.name.toLowerCase().includes(q)) return false;
        if (roleFilter !== "all" && platformRoleOf(m) !== roleFilter) return false;
        if (laneFilter === "agency" && m.clientId) return false;
        if (
          laneFilter !== "all" &&
          laneFilter !== "agency" &&
          m.clientId !== laneFilter
        )
          return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, search, roleFilter, laneFilter]);

  function add() {
    if (name.trim() === "") return;
    start(async () => {
      try {
        await createTeamMember({
          name,
          platformRole,
          repKind: platformRole === "sales_rep" ? repKind : null,
          subtype: platformRole === "team_member" ? subtype : null,
          email: email || "",
          clientId: scope || null,
        });
        toast({ tone: "success", title: `${name.trim()} added to the roster` });
        setName("");
        setEmail("");
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: "Couldn't add the member",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="The"
        highlight="team."
        description="Everyone who runs out of GV OS — their role, whose lane they work, and the sales rep each one maps to."
        status={<StatusPill tone="live">{active.length} active</StatusPill>}
      />

      {members.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active" value={active.length} />
          <StatTile label="Sales reps" value={salesReps} />
          <StatTile label="Delivery & ops" value={delivery} />
          <StatTile label="Lanes covered" value={lanes} />
        </div>
      )}

      <Panel title="Add a team member">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 space-y-1.5">
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
              className={cn(selectClass, "w-40")}
              value={platformRole}
              onChange={(e) => setPlatformRole(e.target.value as PlatformRole)}
            >
              {PLATFORM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {platformRole === "sales_rep" && (
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Type</span>
              <select
                className={cn(selectClass, "w-36")}
                value={repKind}
                onChange={(e) => setRepKind(e.target.value as RepKind)}
              >
                {REP_KINDS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {platformRole === "team_member" && (
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Type</span>
              <select
                className={cn(selectClass, "w-40")}
                value={subtype}
                onChange={(e) => setSubtype(e.target.value as MemberSubtype)}
              >
                {MEMBER_SUBTYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
              className="w-48"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Lane</span>
            <select
              className={cn(selectClass, "w-36")}
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
            No team members yet. Add the crew above — reps, managers, copywriters, VAs —
            and they show up here.
          </p>
        </Panel>
      ) : (
        <Panel
          title={`Roster — ${filtered.length}${
            filtered.length !== members.length ? ` of ${members.length}` : ""
          }`}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="text-faint pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="h-8 w-36 pl-8 text-xs"
                />
              </div>
              <select
                className={cn(selectClass, "h-8 text-xs")}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "all" | PlatformRole)}
                aria-label="Filter by role"
              >
                <option value="all">All roles</option>
                {PLATFORM_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select
                className={cn(selectClass, "h-8 text-xs")}
                value={laneFilter}
                onChange={(e) => setLaneFilter(e.target.value)}
                aria-label="Filter by lane"
              >
                <option value="all">All lanes</option>
                <option value="agency">Agency-wide</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          }
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Lane</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-faint px-4 py-8 text-center">
                      No members match these filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => (
                    <tr
                      key={m.id}
                      className={cn(
                        "hover:bg-secondary/30 border-b transition-colors last:border-0",
                        m.status !== "active" && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/team/${m.id}`}
                          className="group inline-flex items-center gap-2.5 font-medium transition-colors"
                        >
                          <Avatar name={m.name} />
                          <span className="group-hover:text-brand inline-flex items-center gap-1.5 transition-colors">
                            {m.name}
                            {m.repId && (
                              <Link2
                                className="text-brand size-3"
                                aria-label="Linked to a sales rep"
                              />
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">
                        {memberRoleLabel(m)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 text-[11px]",
                            m.clientName
                              ? "text-muted-foreground"
                              : "border-brand/30 text-brand",
                          )}
                        >
                          {m.clientName ?? "Agency"}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">
                        {m.email ? (
                          <a
                            href={`mailto:${m.email}`}
                            className="hover:text-brand inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Mail className="size-3" /> {m.email}
                          </a>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone={m.status === "active" ? "live" : "muted"}>
                          {m.status === "active" ? "Active" : "Inactive"}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusToggle member={m} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
