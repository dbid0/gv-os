import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Rocket } from "lucide-react";
import { eq } from "drizzle-orm";

import { GenerateTemplatesButton } from "@/components/sales/generate-templates-button";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { offerSettings, revShareRules } from "@/db/schema/app";
import { onboardingProgress, onboardingSteps } from "@/lib/clients/onboarding";
import { listIntegrations } from "@/lib/integrations/queries";
import { clientBySlug } from "@/lib/roster";
import { getTeamBySlug, listEodTemplates } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Client setup - GV OS" };
export const dynamic = "force-dynamic";

async function hasRow(
  clientId: string,
  which: "revshare" | "settings",
): Promise<boolean> {
  try {
    const db = getDb();
    if (which === "revshare") {
      const [r] = await db
        .select({ id: revShareRules.id })
        .from(revShareRules)
        .where(eq(revShareRules.clientId, clientId))
        .limit(1);
      return Boolean(r);
    }
    const [r] = await db
      .select({ clientId: offerSettings.clientId })
      .from(offerSettings)
      .where(eq(offerSettings.clientId, clientId))
      .limit(1);
    return Boolean(r);
  } catch {
    return false;
  }
}

export default async function ClientSetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();

  const [team, allIntegrations, templates] = await Promise.all([
    getTeamBySlug(slug),
    listIntegrations(),
    listEodTemplates(),
  ]);

  const [hasRevShareRule, hasOfferSettings] = team
    ? await Promise.all([hasRow(team.id, "revshare"), hasRow(team.id, "settings")])
    : [false, false];

  const steps = onboardingSteps({
    hasRevShareRule,
    repCount: team ? team.reps.filter((r) => r.status === "active").length : 0,
    templateCount: team ? templates.filter((t) => t.clientId === team.id).length : 0,
    connectedFeedCount: team
      ? allIntegrations.filter((c) => c.clientId === team.id && c.status !== "revoked")
          .length
      : 0,
    hasTrackingSheet: Boolean(team?.trackingSheetId),
    hasOfferSettings,
  });
  const progress = onboardingProgress(steps);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={`Set up ${client.name}`}
        description="Everything it takes to stand this offer up in GV OS. Work top to bottom — each step links to where it's done."
        status={
          <StatusPill tone={progress.complete ? "live" : "progress"}>
            {progress.done} of {progress.total} done · {progress.pct}%
          </StatusPill>
        }
        actions={
          <Link
            href={`/clients/${slug}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Back to offer
          </Link>
        }
      />

      {/* Progress bar — the whole point of a setup flow is to see the finish. */}
      <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all"
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      {progress.complete && (
        <Panel>
          <div className="flex items-center gap-3 py-2">
            <span className="bg-success/15 text-success grid size-9 shrink-0 place-items-center rounded-lg">
              <Rocket className="size-4" />
            </span>
            <p className="text-sm">
              <span className="font-medium">{client.name} is fully set up.</span>{" "}
              <span className="text-muted-foreground">
                Every feed, template, and rule is in place.
              </span>
            </p>
          </div>
        </Panel>
      )}

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-4",
              step.done ? "bg-card" : "border-brand/30 bg-brand-soft/20",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                step.done
                  ? "border-success/40 bg-success/15 text-success"
                  : "border-brand/40 text-brand",
              )}
            >
              {step.done ? <Check className="size-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{step.label}</p>
              <p className="text-muted-foreground text-xs">{step.detail}</p>
            </div>
            {step.key === "templates" && !step.done ? (
              <GenerateTemplatesButton missing={1} />
            ) : (
              <Link
                href={
                  step.href.startsWith("#") ? `/clients/${slug}${step.href}` : step.href
                }
                className={cn(
                  buttonVariants({
                    variant: step.done ? "ghost" : "outline",
                    size: "sm",
                  }),
                  "gap-1.5",
                )}
              >
                {step.done ? "Review" : "Set up"}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-faint text-xs">
        {team
          ? "Reps and rev-share rates are managed in their own sections; this page just tracks whether each is in place."
          : `${client.name} has no sales workspace yet — create it from the Sales section to enable reps, templates, and deals.`}
      </p>
    </div>
  );
}
