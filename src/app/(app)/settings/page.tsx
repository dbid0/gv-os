import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Settings - GV OS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return <SettingsForm settings={settings} />;
}
