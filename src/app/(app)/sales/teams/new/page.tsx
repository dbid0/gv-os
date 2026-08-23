import Link from "next/link";
import { ArrowLeft, Rocket } from "lucide-react";

import { Panel } from "@/components/ui/panel";

export const metadata = { title: "New team — Onboarding - GV OS" };

/**
 * New-team onboarding (Daniel's ask): "Add new" opens the guided setup for a
 * new sales team/offer. The stages mirror how a real team stands up — named
 * after RepVision's team config model (EOD/BOD templates per role, commission
 * structure, goals, speed-to-lead), which is the blueprint GV OS runs on.
 */

const STAGES = [
  {
    title: "Name the offer & lane",
    detail:
      "The offer name, its owner, and the workspace slug. This creates the team's branded workspace and its spot in the switcher.",
  },
  {
    title: "Add reps & roles",
    detail:
      "Closers, setters, DM setters, and the manager — each with their commission split. Roles drive which EOD template each rep fills.",
  },
  {
    title: "EOD / BOD templates per role",
    detail:
      "The daily report each role submits. GV's standard templates are pre-filled per offer; adjust the fields a specific team needs.",
  },
  {
    title: "Commission structure",
    detail:
      "Default closer / setter / DM-setter / manager percentages, the cash-vs-revenue basis, and processor-fee handling.",
  },
  {
    title: "Goals & speed-to-lead",
    detail:
      "Monthly revenue goal, show-rate and close-rate targets, required EOD days, and the dialing window for the 5-minute speed-to-lead rule.",
  },
  {
    title: "Connect the sheet & go live",
    detail:
      "Point the team at its offer's Google Sheet so EODs and deals sync both ways, then the team goes live on the dashboard.",
  },
];

export default function NewTeamOnboardingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Onboard a new{" "}
            <span className="text-gradient-brand whitespace-nowrap">sales team.</span>
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            The guided setup for a new offer. Nothing is created until you finish — this
            is the map of what standing up a team involves.
          </p>
        </div>
        <Link
          href="/sales"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" /> Teams
        </Link>
      </div>

      <Panel title="Setup stages">
        <div className="space-y-2">
          {STAGES.map((stage, i) => (
            <div
              key={stage.title}
              className="bg-card flex items-start gap-3 rounded-lg border p-3"
            >
              <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{stage.title}</p>
                <p className="text-muted-foreground text-xs">{stage.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Ready to build it out">
        <p className="text-faint mb-4 text-sm">
          The interactive team builder — create the workspace, add reps, and wire the
          sheet in one flow — plugs in here. For now, teams are stood up through the
          full onboarding, and this is its front door.
        </p>
        <span className="bg-secondary/60 text-muted-foreground inline-flex cursor-not-allowed items-center gap-2 rounded-lg px-4 py-2 text-sm">
          <Rocket className="size-4" /> Start build (wiring up)
        </span>
      </Panel>
    </div>
  );
}
