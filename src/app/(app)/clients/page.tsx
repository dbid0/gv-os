import {
  ClientProfileCard,
  type ClientCard,
} from "@/components/clients/client-profile-card";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status";
import { clientLogos } from "@/lib/clients/logos";
import { clientInitial, roster } from "@/lib/roster";

export const metadata = {
  title: "Clients - GV OS",
};

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const logos = await clientLogos();
  const cards: ClientCard[] = roster.map((client) => ({
    slug: client.slug,
    name: client.name,
    owner: client.owner,
    category: client.category,
    blurb: client.blurb,
    since: client.since,
    accent: client.accent,
    initial: clientInitial(client.name),
    logo: logos[client.slug] ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="roster."
        status={<StatusPill tone="live">{roster.length} active</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((client) => (
          <ClientProfileCard key={client.slug} client={client} />
        ))}
      </div>
    </div>
  );
}
