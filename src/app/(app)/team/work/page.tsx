import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/shell/page-header";
import { WorkBoard, type ClientOption } from "@/components/work/work-board";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { clientBySlug } from "@/lib/roster";
import { cn } from "@/lib/utils";
import { listWorkItems, listWorkMembers } from "@/lib/work/queries";

export const metadata = { title: "Team work - GV OS" };
export const dynamic = "force-dynamic";

export default async function TeamWorkPage() {
  const db = getDb();
  const [items, members, clientRows] = await Promise.all([
    listWorkItems(),
    listWorkMembers(),
    db
      .select({ id: clients.id, name: clients.name, slug: clients.slug })
      .from(clients)
      .where(eq(clients.status, "active")),
  ]);

  const clientOptions: ClientOption[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    accent: clientBySlug(c.slug)?.accent ?? "var(--brand)",
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Team"
        highlight="work."
        description="Copywriting and delivery across every offer — who's on what, and how it's going per client. Status flows into the calendar; call notes drop tasks here automatically."
        actions={
          <Link
            href="/team"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Team
          </Link>
        }
      />
      <WorkBoard items={items} members={members} clients={clientOptions} />
    </div>
  );
}
