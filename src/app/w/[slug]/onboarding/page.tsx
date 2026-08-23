import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * Workspace onboarding (Daniel's ask): the client's install journey in one
 * place. Today: the GV standard stages. Next: the Notion onboarding hub
 * hosted here through the client portal, so a new client never leaves the
 * workspace to get set up.
 */

const STAGES = [
  {
    title: "Kickoff",
    detail: "Agreement signed, clarity call done, brand sheets voice-filled",
  },
  {
    title: "Access & accounts",
    detail: "ggv@ workspace, stack accounts created, credentials sealed",
  },
  {
    title: "Funnel build",
    detail: "Landing pages, application, booking flow, A2P compliance set",
  },
  {
    title: "Sales infrastructure",
    detail: "CRM pipelines, scripts, sequences, tracking sheets, team seats",
  },
  {
    title: "Launch",
    detail: "Content engine live, speed-to-lead armed, first calls booked",
  },
];

export default async function WorkspaceOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Panel
        title={`Onboarding — ${client.name}`}
        aside={<StatusPill tone="progress">In motion</StatusPill>}
      >
        <p className="text-faint mb-4 text-sm">
          The GV install, stage by stage. The full interactive onboarding hub (today in
          Notion) moves in here as the client portal opens up — one place for every
          step, asset drop, and sign-off.
        </p>
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
                <p className="flex items-center gap-2 text-sm font-medium">
                  {stage.title}
                  {i === 0 && <CheckCircle2 className="text-success size-3.5" />}
                </p>
                <p className="text-muted-foreground text-xs">{stage.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
