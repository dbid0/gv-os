import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  Boxes,
  Check,
  ListChecks,
  MessagesSquare,
  NotebookText,
  Percent,
  Plug,
  Receipt,
  Rocket,
  Sheet,
  Tags,
  GraduationCap,
  Users,
  PhoneForwarded,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { eq } from "drizzle-orm";

import { GenerateTemplatesButton } from "@/components/sales/generate-templates-button";
import { OfferModelField } from "@/components/clients/offer-model-field";
import { TrackingSheetField } from "@/components/clients/tracking-sheet-field";
import {
  CommissionRatesPanel,
  type ClientRatesRow,
} from "@/components/settings/commission-rates-panel";
import {
  OfferSettingsPanel,
  type OfferSettingsRow,
} from "@/components/settings/offer-settings-panel";
import { CallOutcomeRulesPanel } from "@/components/settings/call-outcome-rules-panel";
import { PaymentTagRulesPanel } from "@/components/settings/payment-tag-rules-panel";
import type { OutcomeRule } from "@/lib/calls/outcome-rules";
import { listOutcomeRules } from "@/lib/calls/outcome-rules-store";
import { StudentProgramPanel } from "@/components/settings/student-program-panel";
import { SettingsSection } from "@/components/settings/settings-section";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { clients, offerSettings, revShareRules } from "@/db/schema/app";
import type { OfferSettings } from "@/db/schema/app";
import { onboardingProgress, onboardingSteps } from "@/lib/clients/onboarding";
import { listIntegrations } from "@/lib/integrations/queries";
import { listRates } from "@/lib/payments/rates-store";
import {
  loadTagRulesPanel,
  type TagRulesPanelData,
} from "@/lib/tracking/tag-rules-panel";
import { rosterClientBySlug } from "@/lib/roster-server";
import { getTeamBySlug, listEodTemplates } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Client setup - GV OS" };
export const dynamic = "force-dynamic";

/** In-page groups, mirrored into the left sub-nav as scroll anchors. */
const NAV_GROUPS = [
  { id: "offer-setup", label: "Offer setup" },
  { id: "tracking-money", label: "Tracking & money" },
  { id: "access-tools", label: "Access & tools" },
] as const;

type Tile = { href: string; icon: LucideIcon; title: string; detail: string };

/** The reference product's setup tile: icon box, name, one line, an arrow. */
function NavTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className="group bg-secondary/40 hover:bg-secondary/70 flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors"
    >
      <span className="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg border bg-black/20">
        <tile.icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{tile.title}</span>
        <span className="text-muted-foreground block text-xs leading-snug">
          {tile.detail}
        </span>
      </span>
      <ArrowRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default async function ClientSetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();

  const db = getDb();
  const [team, allIntegrations, templates] = await Promise.all([
    getTeamBySlug(slug),
    listIntegrations(),
    listEodTemplates(),
  ]);

  // Per-offer facts that drive both the checklist and the embedded controls.
  // Fail-soft: a read error degrades to "not set up yet" rather than a 500.
  let hasRevShareRule = false;
  let offerRow: OfferSettings | undefined;
  let monthlyGoalCents: number | null = null;
  let rateRows: Awaited<ReturnType<typeof listRates>> = [];
  let tagRules: TagRulesPanelData | null = null;
  let outcomeRules: OutcomeRule[] | null = null;
  if (team) {
    try {
      tagRules = await loadTagRulesPanel(team.id);
    } catch {
      // A rules read error leaves the section in its "couldn't load" state.
    }
    try {
      outcomeRules = await listOutcomeRules(team.id);
    } catch {
      // Same: the section says it couldn't load, nothing else breaks.
    }
    try {
      const [rev, offRows, cliRows, rates] = await Promise.all([
        db
          .select({ id: revShareRules.id })
          .from(revShareRules)
          .where(eq(revShareRules.clientId, team.id))
          .limit(1),
        db
          .select()
          .from(offerSettings)
          .where(eq(offerSettings.clientId, team.id))
          .limit(1),
        db
          .select({ monthlyTargetCents: clients.monthlyTargetCents })
          .from(clients)
          .where(eq(clients.id, team.id))
          .limit(1),
        listRates(),
      ]);
      hasRevShareRule = Boolean(rev[0]);
      offerRow = offRows[0];
      monthlyGoalCents = cliRows[0]?.monthlyTargetCents ?? null;
      rateRows = rates;
    } catch {
      // leave defaults
    }
  }
  const hasOfferSettings = Boolean(offerRow);

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

  // Single-client rows for the panels that agency settings renders per offer.
  const offerSettingsRows: OfferSettingsRow[] = team
    ? [
        {
          clientId: team.id,
          clientName: client.name,
          eodAlertTime: offerRow?.eodAlertTime ?? null,
          bodAlertTime: offerRow?.bodAlertTime ?? "12:00",
          confettiThresholdCents: offerRow?.confettiThresholdCents ?? 500_000,
          monthlyGoalCents,
          visibility: offerRow?.visibility ?? {},
        },
      ]
    : [];

  const fmtBps = (bps: number | undefined) =>
    bps === undefined ? "" : String(bps / 100);
  const rateFor = (role: string) =>
    team
      ? rateRows.find((r) => r.clientId === team.id && r.salesRole === role)?.rateBps
      : undefined;
  const ratesRows: ClientRatesRow[] = team
    ? [
        {
          clientId: team.id,
          clientName: client.name,
          setter: fmtBps(rateFor("setter")),
          closer: fmtBps(rateFor("closer")),
          dm_setter: fmtBps(rateFor("dm_setter")),
        },
      ]
    : [];

  const accountTiles: Tile[] = [
    {
      href: `/clients/${slug}/workspace`,
      icon: NotebookText,
      title: "Docs & workspace",
      detail: "SOPs, wikis, and the client's Notion-style workspace.",
    },
    {
      href: `/w/${slug}/sales`,
      icon: BarChart3,
      title: "Sales",
      detail: "Deals, commissions, and the leaderboard.",
    },
    {
      href: `/clients/${slug}#team`,
      icon: Users,
      title: "Team",
      detail: "Reps, roles, and the offers they work.",
    },
    {
      href: `/clients/${slug}/accounting`,
      icon: Receipt,
      title: "Accounting",
      detail: "Cash, rev-share, fees, and deals.",
    },
  ];

  const toolTiles: Tile[] = [
    {
      href: `/clients/${slug}#data-feeds`,
      icon: Plug,
      title: "Data feeds & integrations",
      detail:
        "This offer's processor, tracking sheet, CRM, and email — connect and import.",
    },
    {
      href: "/settings/integrations",
      icon: MessagesSquare,
      title: "Agency integrations & Discord",
      detail: "Shared keys and the Discord webhook live in agency settings.",
    },
  ];

  const noWorkspaceNote = (
    <p className="text-muted-foreground text-sm">
      {client.name} has no sales workspace yet — create it from the{" "}
      <Link href={`/w/${slug}/sales`} className="text-brand hover:underline">
        Sales section
      </Link>{" "}
      to enable reps, alerts, goals, and commission rates.
    </p>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <PageHeader
        title={`Set up ${client.name}`}
        description="Everything it takes to stand this offer up in GV OS — grouped by area. Jump to a section from the left, or work top to bottom."
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

      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        {/* Left in-page sub-nav — anchors to each group. */}
        <nav aria-label="Setup sections" className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-faint mb-3 text-[11px] font-medium tracking-wider uppercase">
            This offer
          </p>
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {NAV_GROUPS.map((g) => (
              <li key={g.id}>
                <a
                  href={`#${g.id}`}
                  className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 block rounded-md px-3 py-1.5 text-sm transition-colors"
                >
                  {g.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right column — grouped, titled sections. */}
        <div className="min-w-0 space-y-10">
          {/* GROUP: Offer setup */}
          <section id="offer-setup" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Offer setup</h2>
              <p className="text-muted-foreground text-sm">
                How this offer is put together — set these up once, then get on with the
                work.
              </p>
            </div>

            <SettingsSection
              icon={Boxes}
              title="Account setup"
              description="The areas that make up this client's workspace — open one to work in it."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {accountTiles.map((t) => (
                  <NavTile key={t.href} tile={t} />
                ))}
              </div>
            </SettingsSection>

            <SettingsSection
              icon={ListChecks}
              title="Setup progress"
              description="Each step links to where it's done. Reps and rev-share rates are managed in their own sections; this just tracks whether each is in place."
              aside={`${progress.done}/${progress.total}`}
            >
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
                          step.href.startsWith("#")
                            ? `/clients/${slug}${step.href}`
                            : step.href
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
            </SettingsSection>
          </section>

          {/* GROUP: Tracking & money */}
          <section id="tracking-money" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Tracking & money</h2>
              <p className="text-muted-foreground text-sm">
                The feed and the rules that fund this offer&apos;s numbers.
              </p>
            </div>

            {team ? (
              <>
                <SettingsSection
                  icon={Sheet}
                  title="Tracking & offer type"
                  description="What kind of offer this is, and the new-deal-forms sheet that validates revenue against cash and drives rep commissions."
                >
                  <div className="space-y-4">
                    <OfferModelField slug={slug} model={team.offerModel ?? null} />
                    <TrackingSheetField slug={slug} sheetId={team.trackingSheetId} />
                  </div>
                </SettingsSection>

                <SettingsSection
                  icon={BellRing}
                  title="Goals & alerts"
                  description="EOD/BOD alert times feed the notification engine, the confetti threshold decides which closes get the full celebration, and the monthly goal is what this dashboard measures against. Goals are targets — never money in the ledger."
                >
                  <OfferSettingsPanel rows={offerSettingsRows} />
                </SettingsSection>

                <SettingsSection
                  icon={Percent}
                  title="Commission rates"
                  description="Setter, closer, and DM-setter rates for this offer. Empty means unset — commissions derive unknown, never zero. Overrides on individual claims beat these."
                >
                  <CommissionRatesPanel rows={ratesRows} />
                </SettingsSection>

                <SettingsSection
                  icon={GraduationCap}
                  title="Students program"
                  description="Who counts as a student, how long the program runs, and how many 1-on-1 calls each student gets. With a minimum, only payers who made a single payment of at least that much appear on the Students board, and their week counts from that payment. With a length, students past the last week move to Program complete. Blank keeps each open; the 1-on-1 limit shows as “2 of 4” on every student card."
                >
                  <StudentProgramPanel
                    slug={slug}
                    minPaymentDollars={
                      offerRow?.studentMinPaymentCents
                        ? (offerRow.studentMinPaymentCents / 100).toFixed(2)
                        : ""
                    }
                    lengthWeeks={
                      offerRow?.programLengthWeeks
                        ? String(offerRow.programLengthWeeks)
                        : ""
                    }
                    callLimit={
                      offerRow?.oneOnOneCallLimit
                        ? String(offerRow.oneOnOneCallLimit)
                        : ""
                    }
                  />
                </SettingsSection>

                <SettingsSection
                  icon={Tags}
                  title="Payment tag rules"
                  description="What each payment in this offer's feed means. Label products, and keep test charges, internal transfers and pass-throughs out of dashboard cash. The payments themselves are never changed; delete a rule and its money comes back."
                >
                  {tagRules ? (
                    <PaymentTagRulesPanel slug={slug} data={tagRules} />
                  ) : (
                    <p className="text-warning text-sm">
                      Couldn&apos;t load the tag rules just now. Nothing about them has
                      changed; reload to try again.
                    </p>
                  )}
                </SettingsSection>

                <SettingsSection
                  icon={PhoneForwarded}
                  title="Call outcome rules"
                  description="What filing a call's outcome in GV OS sets off: tag the lead (so a saved Leads view becomes a work queue) and/or notify the team. Sheet rows don't trigger rules. Voiding a report takes its tags back off."
                >
                  {outcomeRules ? (
                    <CallOutcomeRulesPanel slug={slug} rules={outcomeRules} />
                  ) : (
                    <p className="text-warning text-sm">
                      Couldn&apos;t load the outcome rules just now. Reload to try
                      again.
                    </p>
                  )}
                </SettingsSection>
              </>
            ) : (
              <SettingsSection
                icon={BellRing}
                title="Goals, alerts & commissions"
                description="Alert times, goals, and commission rates are set per offer once the sales workspace exists."
              >
                {noWorkspaceNote}
              </SettingsSection>
            )}
          </section>

          {/* GROUP: Access & tools */}
          <section id="access-tools" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Access & tools</h2>
              <p className="text-muted-foreground text-sm">
                Connected tools, and where the rest of this offer&apos;s wiring lives.
              </p>
            </div>

            <SettingsSection
              icon={Plug}
              title="Connected tools"
              description="This offer's live feeds are managed on its command center; shared keys and the agency Discord webhook live in agency settings."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {toolTiles.map((t) => (
                  <NavTile key={t.href} tile={t} />
                ))}
              </div>
            </SettingsSection>
          </section>
        </div>
      </div>
    </div>
  );
}
