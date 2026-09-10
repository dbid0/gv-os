import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Boxes,
  Building2,
  MessagesSquare,
  Percent,
  Plug,
  Target,
  User,
  Users,
} from "lucide-react";

import { AgencyDiscordCard } from "@/components/settings/agency-discord-card";
import {
  OfferSettingsPanel,
  type OfferSettingsRow,
} from "@/components/settings/offer-settings-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  CommissionRatesPanel,
  type ClientRatesRow,
} from "@/components/settings/commission-rates-panel";
import { listRates } from "@/lib/payments/rates-store";
import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";
import { getSettings } from "@/lib/settings";
import { eq } from "drizzle-orm";

export const metadata = { title: "Settings - GV OS" };
export const dynamic = "force-dynamic";

/** The reference product's setup tile: icon box, name, two lines, an arrow. */
const SETUP_TILES = [
  {
    href: "/clients",
    icon: Building2,
    title: "Clients",
    detail: "Every offer on the books — brands, logos, and each client's workspace.",
  },
  {
    href: "/team",
    icon: Users,
    title: "Team",
    detail: "Who is on the floor, their roles, and the offers they work.",
  },
  {
    href: "/settings/integrations",
    icon: Plug,
    title: "Integrations",
    detail: "Payment processors, sheets, and CRMs — keys sealed on save.",
  },
  {
    href: "/profile",
    icon: User,
    title: "Your account",
    detail: "Profile picture, display name, and Discord handle.",
  },
];

export default async function SettingsPage() {
  const db = getDb();
  const [settings, clientRows, offerRows, rateRows] = await Promise.all([
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
    listRates(),
  ]);

  const fmtBps = (bps: number | undefined) =>
    bps === undefined ? "" : String(bps / 100);
  const ratesRows: ClientRatesRow[] = clientRows.map((c) => {
    const forClient = rateRows.filter((r) => r.clientId === c.id);
    const bps = (role: string) => forClient.find((r) => r.salesRole === role)?.rateBps;
    return {
      clientId: c.id,
      clientName: c.name,
      setter: fmtBps(bps("setter")),
      closer: fmtBps(bps("closer")),
      dm_setter: fmtBps(bps("dm_setter")),
    };
  });

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Manage the agency&apos;s settings and preferences.
        </p>
      </header>

      <SettingsSection
        icon={Boxes}
        title="Account setup"
        description="How this workspace is put together — set these up once, then get on with the work."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {SETUP_TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group bg-secondary/40 hover:bg-secondary/70 flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors"
            >
              <span className="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg border bg-black/20">
                <t.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="text-muted-foreground block text-xs leading-snug">
                  {t.detail}
                </span>
              </span>
              <ArrowRight className="text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Target}
        title="Goals & targets"
        description="Display currency and the monthly goal each dashboard measures against. Goals are targets — never money in the ledger."
      >
        <SettingsForm settings={settings} />
      </SettingsSection>

      <SettingsSection
        icon={BellRing}
        title="Per-offer alerts & celebrations"
        description="EOD/BOD alert times feed the notification engine (misses fire once their report sources connect). The confetti threshold decides which closes get the full celebration — every close still gets the slide-in."
      >
        <OfferSettingsPanel rows={rows} />
      </SettingsSection>

      <SettingsSection
        icon={Percent}
        title="Commission rates"
        description="Setter, closer, and DM-setter rates per offer. Empty means unset — commissions derive unknown, never zero."
      >
        <CommissionRatesPanel rows={ratesRows} />
      </SettingsSection>

      <SettingsSection
        icon={MessagesSquare}
        title="Agency Discord"
        description="Push GV OS updates into the agency Discord HQ."
      >
        <AgencyDiscordCard />
      </SettingsSection>
    </div>
  );
}
