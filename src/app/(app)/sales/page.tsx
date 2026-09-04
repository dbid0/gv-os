import Link from "next/link";
import { ArrowRight, Gauge, GitBranch, Plus } from "lucide-react";

import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { cents } from "@/lib/money";
import { ClientLogo } from "@/components/clients/client-logo";
import { getClientReport } from "@/lib/clients/report";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { scopeRowsToViewer } from "@/lib/home/visibility";
import { roster } from "@/lib/roster";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Teams - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Sales landing is the admin view of the sales TEAMS (Daniel's ask): one
 * card per offer — the cash it has collected, its monthly goal, and one way in.
 * A team in GV OS is a client offer; this is where all of them are managed.
 *
 * Cash is READ FROM `getClientReport`, the same tested client-ledger figure the
 * client's own accounting page shows, so this card can never disagree with it.
 * Reports are fetched with bounded concurrency — a page must not burst the
 * connection pool.
 */
export default async function SalesPage() {
  // Whose offers this viewer may read. A rep is granted /sales for their own
  // leaderboard and commissions, but must not see other clients' books.
  const [scope, teamsAll, reps] = await Promise.all([
    getViewerScope(),
    listTeams(),
    listReps(),
  ]);
  const teams = scopeRowsToViewer(teamsAll, (t) => t.id, scope.allowed);

  const cashByTeam = new Map<string, number>();
  for (const team of teams) {
    try {
      const report = await getClientReport(team.slug, team.name);
      // Only record cash the ledger could actually attribute to this offer.
      // An unattributable team used to render "$0.00", which reads as "they
      // have collected nothing" when the truth is that nothing could be
      // matched to them at all.
      if (report.mirror.attributed) {
        cashByTeam.set(team.slug, report.mirror.cashCents);
      }
    } catch {
      // A reporting hiccup shows "—", never a broken card.
    }
  }

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
                    <p className="text-faint text-[11px]">Cash collected</p>
                    <p className="mt-0.5 text-lg font-semibold">
                      {cashByTeam.has(team.slug) ? (
                        <Money amount={cents(cashByTeam.get(team.slug) ?? 0)} />
                      ) : (
                        "—"
                      )}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
