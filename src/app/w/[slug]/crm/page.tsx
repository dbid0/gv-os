import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { Kpi } from "@/components/ui/metric";
import { getDb } from "@/db/client";
import { clients, crmActivity } from "@/db/schema/app";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

/** Workspace CRM: rep activity from this client's Close account. */
export default async function WorkspaceCrmPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  const [activity] = row
    ? await db
        .select({ n: count() })
        .from(crmActivity)
        .where(eq(crmActivity.clientId, row.id))
    : [{ n: 0 }];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="CRM activities captured" value={String(activity?.n ?? 0)} />
        <Kpi label="Calls · 7d" value="—" />
        <Kpi label="Speed to lead" value="—" />
      </div>

      {(activity?.n ?? 0) === 0 && (
        <Panel title="Waiting on the Close connection">
          <p className="text-faint py-8 text-center text-sm">
            Connect this client&apos;s Close API key under Settings → Integrations and
            rep calls, SMS, and emails start capturing on the daily sync — call volume,
            talk time, and speed-to-lead land here.
          </p>
        </Panel>
      )}
    </div>
  );
}
