import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";

import { Panel } from "@/components/ui/panel";
import { ColumnChart } from "@/components/ui/column-chart";
import { Kpi } from "@/components/ui/metric";
import { getDb } from "@/db/client";
import { applications, clients } from "@/db/schema/app";
import { bucketByDay, chartColorForClient } from "@/lib/charts";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

/** Workspace Sales: this offer's funnel — applications now, calls/deals as
 * bookings and CRM data land. */
export default async function WorkspaceSalesPage({
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
  const now = new Date();
  const daysAgo30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const apps = row
    ? await db
        .select({
          name: applications.name,
          email: applications.email,
          formName: applications.formName,
          submittedAt: applications.submittedAt,
          createdAt: applications.createdAt,
        })
        .from(applications)
        .where(
          and(
            eq(applications.clientId, row.id),
            gte(applications.createdAt, daysAgo30),
          ),
        )
        .orderBy(desc(applications.createdAt))
        .limit(100)
    : [];

  const perDay = bucketByDay(
    apps.map((a) => a.submittedAt ?? a.createdAt),
    30,
    now,
  );
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const last7 = apps.filter(
    (a) => (a.submittedAt ?? a.createdAt).getTime() > weekAgo,
  ).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Applications · 30d" value={String(apps.length)} tone="brand" />
        <Kpi label="Last 7 days" value={String(last7)} />
        <Kpi label="Calls & deals" value="—" />
      </div>

      {apps.length > 0 && (
        <Panel title="Applications per day">
          <ColumnChart data={perDay} color={chartColorForClient(client.name)} />
        </Panel>
      )}

      {apps.length === 0 ? (
        <Panel title="No applications yet">
          <p className="text-faint py-8 text-center text-sm">
            Applications flow in from the Typeform connection. Calls and closed deals
            join as bookings and CRM data land.
          </p>
        </Panel>
      ) : (
        <Panel title="Recent applications">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-faint border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 font-medium">Form</th>
              </tr>
            </thead>
            <tbody>
              {apps.slice(0, 30).map((a, i) => (
                <tr key={`${a.email}-${i}`} className="border-b last:border-0">
                  <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                    {(a.submittedAt ?? a.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "America/Chicago",
                    })}
                  </td>
                  <td className="py-2 pr-3">{a.name ?? "—"}</td>
                  <td className="text-muted-foreground max-w-56 truncate py-2 pr-3">
                    {a.email ?? "—"}
                  </td>
                  <td className="text-faint max-w-48 truncate py-2 text-xs">
                    {a.formName ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
