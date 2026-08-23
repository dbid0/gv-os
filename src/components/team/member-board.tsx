"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Mail } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
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

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * A member's profile. The full member-facing view (their board, EODs, their
 * offers) is a later build — for now this is the clean identity card, one per
 * person, reachable from the roster.
 */
export function MemberBoard({
  member,
  members,
}: {
  member: Member;
  members: MemberOption[];
}) {
  const router = useRouter();
  const active = member.status === "active";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={member.name.split(" ")[0]}
        highlight="'s profile."
        description={`${roleLabel(member.role)} · ${member.clientName ?? "Agency-wide"} lane.`}
        status={
          <StatusPill tone={active ? "live" : "muted"}>
            {active ? "Active" : "Inactive"}
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
                aria-label="Jump to member"
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

      <Panel title="Details">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-faint text-xs">Role</dt>
            <dd className="text-sm">{roleLabel(member.role)}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Lane</dt>
            <dd className="text-sm">{member.clientName ?? "Agency-wide"}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Email</dt>
            <dd className="text-sm">
              {member.email ? (
                <a
                  href={`mailto:${member.email}`}
                  className="hover:text-brand inline-flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="size-3.5" /> {member.email}
                </a>
              ) : (
                <span className="text-faint">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Status</dt>
            <dd className="text-sm">{active ? "Active" : "Inactive"}</dd>
          </div>
          {member.notes && (
            <div className="sm:col-span-2">
              <dt className="text-faint text-xs">Notes</dt>
              <dd className="text-sm">{member.notes}</dd>
            </div>
          )}
        </dl>
      </Panel>
    </div>
  );
}
