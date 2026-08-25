import Link from "next/link";
import { ArrowRight, Plug, User } from "lucide-react";

import { AgencyDiscordCard } from "@/components/settings/agency-discord-card";
import {
  OfferSettingsPanel,
  type OfferSettingsRow,
} from "@/components/settings/offer-settings-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";
import { getSettings } from "@/lib/settings";
import { eq } from "drizzle-orm";

export const metadata = { title: "Settings - GV OS" };
export const dynamic = "force-dynamic";

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-faint px-1 text-[11px] font-medium tracking-wider uppercase">
      {children}
    </h2>
  );
}

export default async function SettingsPage() {
  const db = getDb();
  const [settings, clientRows, offerRows] = await Promise.all([
    getSettings(),
    db
      .select({
        id: clients.id,
        name: clients.name,
        monthlyTargetCents: clients.monthlyTargetCents,
      })
      .from(clients)
      .where(eq(clients.status, "active")),
    db.select().from(offerSettings),
  ]);

  const rows: OfferSettingsRow[] = clientRows.map((c) => {
    const existing = offerRows.find((o) => o.clientId === c.id);
    return {
      clientId: c.id,
      clientName: c.name,
      eodAlertTime: existing?.eodAlertTime ?? null,
      bodAlertTime: existing?.bodAlertTime ?? "12:00",
      confettiThresholdCents: existing?.confettiThresholdCents ?? 500_000,
      monthlyGoalCents: c.monthlyTargetCents,
      visibility: existing?.visibility ?? {},
    };
  });

  const shortcuts = [
    {
      href: "/settings/integrations",
      icon: Plug,
      title: "Integrations",
      detail: "Connect payment processors, sheets, and CRMs — keys sealed on save.",
    },
    {
      href: "/profile",
      icon: User,
      title: "Your account",
      detail: "Profile picture, display name, and Discord handle.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader title="Settings" />

      <section className="space-y-3">
        <SectionLabel>Organization</SectionLabel>
        <SettingsForm settings={settings} />
      </section>

      <section className="space-y-3">
        <SectionLabel>Per-offer</SectionLabel>
        <OfferSettingsPanel rows={rows} />
      </section>

      <section className="space-y-3">
        <SectionLabel>Agency sync</SectionLabel>
        <AgencyDiscordCard />
      </section>

      <section className="space-y-3">
        <SectionLabel>Connections & account</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map((s) => (
            <Link key={s.href} href={s.href} className="group block">
              <Panel title={s.title}>
                <div className="flex items-start gap-3">
                  <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-9 shrink-0 place-items-center rounded-lg border">
                    <s.icon className="size-4" />
                  </span>
                  <p className="text-muted-foreground flex-1 text-sm">{s.detail}</p>
                  <ArrowRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
