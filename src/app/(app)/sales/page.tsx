import Link from "next/link";
import { ArrowRight, Gauge, GitBranch, Plus, Settings2, Users } from "lucide-react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { cents } from "@/lib/money";
import { ClientLogo } from "@/components/clients/client-logo";
import { roster } from "@/lib/roster";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Teams - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Sales landing is the admin view of the sales TEAMS (Daniel's ask): one
 * card per offer — reps, goal, and the way into its workspace and config.
 * A team in GV OS is a client offer; this is where all of them are managed.
 */
export default async function SalesPage() {
  const [teams, reps] = await Promise.all([listTeams(), listReps()]);

  const repsByTeam = new Map<string, typeof reps>();
  for (const r of reps) {
    const list = repsByTeam.get(r.clientId) ?? [];
    list.push(r);
    repsByTeam.set(r.clientId, list);
  }
  const ownerOf = (slug: string) => roster.find((c) => c.slug === slug)?.owner ?? null;
  const accentOf = (slug: string) =>
    roster.find((c) => c.slug === slug)?.accent ?? "var(--brand)";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {teams.length} sales {teams.length === 1 ? "team" : "teams"} — each an offer
          with its own reps, EOD cadence, and commission structure.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/sales/pipeline"
            className="bg-secondary/60 hover:bg-secondary text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <GitBranch className="size-4" /> Pipeline
          </Link>
          <Link
            href="/sales/cockpit"
            className="bg-secondary/60 hover:bg-secondary text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Gauge className="size-4" /> Cockpit
          </Link>
          <Link
            href="/sales/teams/new"
            className="border-brand/40 text-brand hover:bg-brand-soft/50 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Add new team
          </Link>
        </div>
      </div>

      {teams.length === 0 ? (
        <Panel title="No teams yet">
          <p className="text-faint py-8 text-center text-sm">
            Add your first sales team above — the onboarding walks the setup.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const teamReps = repsByTeam.get(team.id) ?? [];
            const active = teamReps.filter((r) => r.status === "active").length;
            const goal = team.monthlyTargetCents ?? 0;
            const accent = accentOf(team.slug);
            const owner = ownerOf(team.slug);
            return (
              <div
                key={team.id}
                className="bg-card hover:border-brand/40 flex flex-col rounded-xl border transition-colors"
              >
                <div className="flex items-center gap-3 border-b p-4">
                  <ClientLogo
                    slug={team.slug}
                    name={team.name}
                    accent={accent}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{team.name}</p>
                    {owner && <p className="text-faint text-xs">{owner}</p>}
                  </div>
                  <StatusPill tone="live">Active</StatusPill>
                </div>

                <div className="bg-border grid grid-cols-2 gap-px">
                  <div className="bg-card p-4">
                    <p className="text-faint flex items-center gap-1.5 text-[11px]">
                      <Users className="size-3" /> Reps
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">
                      {active}
                    </p>
                  </div>
                  <div className="bg-card p-4">
                    <p className="text-faint text-[11px]">Monthly goal</p>
                    <p className="mt-0.5 text-lg font-semibold">
                      {goal > 0 ? <Money amount={cents(goal)} /> : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2 border-t p-3">
                  <Link
                    href={`/w/${team.slug}`}
                    className="bg-secondary/60 hover:bg-secondary text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    Enter workspace <ArrowRight className="size-3" />
                  </Link>
                  <Link
                    href={`/clients/${team.slug}`}
                    className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                  >
                    <Settings2 className="size-3.5" /> Configure
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
