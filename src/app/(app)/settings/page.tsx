import {
  OfferSettingsPanel,
  type OfferSettingsRow,
} from "@/components/settings/offer-settings-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";
import { getSettings } from "@/lib/settings";
import { eq } from "drizzle-orm";

export const metadata = { title: "Settings - GV OS" };
export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-6">
      <SettingsForm settings={settings} />
      <OfferSettingsPanel rows={rows} />
    </div>
  );
}
