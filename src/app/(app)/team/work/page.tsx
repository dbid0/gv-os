import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/shell/page-header";
import { WorkBoard, type ClientOption } from "@/components/work/work-board";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { loadRoster } from "@/lib/roster-server";
import { cn } from "@/lib/utils";
import { listWorkItems, listWorkMembers } from "@/lib/work/queries";

export const metadata = { title: "Team work - GV OS" };
export const dynamic = "force-dynamic";

export default async function TeamWorkPage() {
  const rosterList = await loadRoster();
  const clientBySlug = (slug: string) => rosterList.find((c) => c.slug === slug);
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
