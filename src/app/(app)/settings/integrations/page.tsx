import { IntegrationsPanel } from "@/components/integrations/integrations-panel";
import { listIntegrations } from "@/lib/integrations/queries";
import { listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Integrations - GV OS" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const [connections, teams] = await Promise.all([listIntegrations(), listTeams()]);
  return (
    <IntegrationsPanel
      connections={connections.map((c) => ({
        ...c,
        lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      }))}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
