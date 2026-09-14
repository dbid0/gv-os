import { notFound } from "next/navigation";
import { Bot, ShieldCheck } from "lucide-react";

import { McpKeysPanel } from "@/components/settings/mcp-keys-panel";
import { SettingsSection } from "@/components/settings/settings-section";
import { PageHeader } from "@/components/shell/page-header";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { listMcpKeys } from "@/lib/mcp/keys-store";
import { GV_OS_TOOLS } from "@/lib/mcp/tools";

export const metadata = { title: "MCP - GV OS" };
export const dynamic = "force-dynamic";

/**
 * Settings → MCP: connect your own Claude to GV OS. Owners mint read-only API
 * keys here; the server ships no prompts and spends no AI credits of its own —
 * the tools are narrow reads, and the Claude doing the thinking is yours.
 */
export default async function McpSettingsPage() {
  if (!(await viewerIsAdmin())) notFound();
  const keys = await listMcpKeys();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const endpoint = `${origin.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
      <PageHeader
        title="Connect"
        highlight="your Claude."
        description="GV OS speaks MCP. Give your own Claude a read-only key and it can answer questions about every offer — calls, students, leads, integrity alerts — straight from the same numbers these pages show."
      />

      <SettingsSection
        icon={Bot}
        title="API keys"
        description="Each key is read-only. It is shown once when you create it; GV OS keeps only a hash. Revoke a key the moment a device is lost."
      >
        <McpKeysPanel
          endpoint={endpoint}
          keys={keys.map((k) => ({
            id: k.id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
          }))}
        />
      </SettingsSection>

      <SettingsSection
        icon={ShieldCheck}
        title="What a key can read"
        description="Reads only. No tool changes anything, and no tool returns connection keys or vault credentials."
      >
        <ul className="space-y-2">
          {GV_OS_TOOLS.map((t) => (
            <li key={t.name} className="text-sm">
              <code className="text-brand text-xs">{t.name}</code>
              <span className="text-muted-foreground"> — {t.description}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
