import Link from "next/link";
import { count, eq, ne } from "drizzle-orm";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { actionItems, teamMembers } from "@/db/schema/app";

export const metadata = { title: "Team Home - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Team Member home (v2 §6): your board, your day — no accounting.
 * Member identity binds when team logins exist; until then this is the
 * doorway to each member's own board.
 */
export default async function MemberHomePage() {
  const db = getDb();
  const members = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.name,
      role: teamMembers.role,
      open: count(actionItems.id),
    })
    .from(teamMembers)
    .leftJoin(actionItems, eq(actionItems.assigneeId, teamMembers.id))
    .where(ne(teamMembers.status, "inactive"))
    .groupBy(teamMembers.id, teamMembers.name, teamMembers.role);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Your"
        highlight="board."
        description="Tasks, EODs, and your offers' status — pick your board. Accounting lives with the admins."
      />
      {members.length === 0 ? (
        <Panel title="No roster yet">
          <p className="text-faint py-8 text-center text-sm">
            The roster lives under Team — once members are added, each gets a board
            here.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={`/team/${m.id}`}
              className="card-grad hover-lift hover:border-brand/40 rounded-lg border p-4"
            >
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-muted-foreground text-xs">
                {m.role} · {m.open} open {m.open === 1 ? "action" : "actions"}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Panel title="Your EODs">
        <p className="text-faint text-sm">
          Daily reports run through the{" "}
          <Link href="/sales/eod/submit" className="text-brand">
            EOD form
          </Link>{" "}
          for sales roles; team EODs stay on the Agency EODs flow until they move
          in-app.
        </p>
      </Panel>
    </div>
  );
}
