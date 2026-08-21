import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, Clapperboard, Receipt, Users } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { TeamConfig } from "@/components/sales/team-config";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { clientBySlug } from "@/lib/roster";
import { getTeamBySlug } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  return { title: client ? `${client.name} - GV OS` : "Client - GV OS" };
}

// Each client's command center: the modules that reach into their engagement.
// Ready ones link out; the rest are honestly marked until they are built.
const modules = [
  {
    label: "Sales",
    href: "/sales",
    icon: BarChart3,
    detail: "Deals, commissions, leaderboard",
    ready: true,
  },
  {
    label: "Content",
    href: "#",
    icon: Clapperboard,
    detail: "Reels, hooks, what converts",
    ready: false,
  },
  {
    label: "Accounting",
    href: "#",
    icon: Receipt,
    detail: "Payments, fees, rev share",
    ready: false,
  },
  {
    label: "Team",
    href: "#",
    icon: Users,
    detail: "Reps, EODs, scoreboards",
    ready: false,
  },
];

export default async function ClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const team = await getTeamBySlug(slug);

  const facts = [
    { label: "Owner", value: client.owner },
    { label: "Offer", value: client.offer },
    { label: "Category", value: client.category },
    { label: "Rev share", value: client.revShare },
    { label: "Client since", value: client.since },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title={client.name}
        description={client.blurb}
        status={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone="live">Active client</StatusPill>
            <span className="text-faint text-xs">
              {client.owner} · since {client.since}
            </span>
          </span>
        }
        actions={
          <Link
            href="/clients"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> All clients
          </Link>
        }
      />

      {/* The client's colour as a single accent bar — data, not chrome. */}
      <div
        aria-hidden
        className="h-1 w-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${client.accent}, transparent 85%)`,
        }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Panel title="At a glance">
            <dl className="space-y-3">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-0.5">
                  <dt className="text-faint text-[11px] font-medium tracking-wider uppercase">
                    {fact.label}
                  </dt>
                  <dd className="text-sm">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel
            title="Command center"
            aside={<span className="text-faint text-xs">1 live</span>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {modules.map((mod) => {
                const body = (
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg border",
                        mod.ready
                          ? "border-brand/40 bg-brand-soft/50 text-brand"
                          : "bg-secondary text-faint",
                      )}
                    >
                      <mod.icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {mod.label}
                        {!mod.ready && (
                          <span className="text-faint text-[10px] tracking-wide uppercase">
                            Soon
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{mod.detail}</p>
                    </div>
                  </div>
                );

                return mod.ready ? (
                  <Link
                    key={mod.label}
                    href={mod.href}
                    className="card-grad hover-lift hover:border-brand/40 rounded-lg border p-4"
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    key={mod.label}
                    aria-disabled
                    className="bg-card/60 cursor-not-allowed rounded-lg border border-dashed p-4"
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {team && <TeamConfig team={team} />}
    </div>
  );
}
