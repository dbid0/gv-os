import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
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
const SECTIONS = [
  { id: "setup", label: "Account setup" },
  { id: "goals", label: "Goals & targets" },
  { id: "alerts", label: "Alerts & celebrations" },
  { id: "rates", label: "Commission rates" },
  { id: "discord", label: "Agency Discord" },
];

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
    href: "/settings/mcp",
    icon: Bot,
    title: "Connect your Claude",
    detail: "Read-only MCP keys so your own Claude can answer questions about GV OS.",
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
      lowTicketMaxCents: existing?.lowTicketMaxCents ?? null,
      monthlyGoalCents: c.monthlyTargetCents,
      visibility: existing?.visibility ?? {},
    };
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </header>

      {/* Jump nav: one page, anchored sections — you can see everything this
          workspace has without clicking through to find out. */}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-2 border-b pb-4"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <SettingsSection id="setup" icon={Boxes} title="Account setup">
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
        id="goals"
        icon={Target}
        title="Goals & targets"
        description="A goal is a target, never money in the ledger."
      >
        <SettingsForm settings={settings} />
      </SettingsSection>

      <SettingsSection
        id="alerts"
        icon={BellRing}
        title="Alerts & celebrations"
        description="Misses only fire once that offer's report source is connected."
      >
        <OfferSettingsPanel rows={rows} />
      </SettingsSection>

      <SettingsSection
        id="rates"
        icon={Percent}
        title="Commission rates"
        description="Empty means unset — commissions derive unknown, never zero."
      >
        <CommissionRatesPanel rows={ratesRows} />
      </SettingsSection>

      <SettingsSection id="discord" icon={MessagesSquare} title="Agency Discord">
        <AgencyDiscordCard />
      </SettingsSection>
    </div>
  );
}
