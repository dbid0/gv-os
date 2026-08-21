"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Plug, Plus, Trash2 } from "lucide-react";

import {
  connectIntegration,
  deleteIntegration,
  revokeIntegration,
} from "@/app/(app)/settings/integrations/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import {
  CREDENTIAL_LABELS,
  PROVIDER_GROUPS,
  PROVIDERS,
  providerByValue,
} from "@/lib/integrations/providers";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

/** Serializable mirror of IntegrationRow (dates as ISO strings). */
interface ConnectionRow {
  id: string;
  provider: string;
  label: string;
  clientId: string | null;
  clientName: string | null;
  secretHint: string | null;
  status: string;
  lastSyncAt: string | null;
  lastSyncNote: string | null;
  webhookPath: string | null;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function ConnectionCard({ row }: { row: ConnectionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const provider = providerByValue(row.provider);
  const revoked = row.status === "revoked";

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div
      className={cn(
        "bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3",
        revoked && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.label}</p>
        <p className="text-faint flex flex-wrap items-center gap-x-3 text-[11px]">
          <span>{provider?.label ?? row.provider}</span>
          {row.secretHint && (
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3" /> {row.secretHint}
            </span>
          )}
          <span>
            {row.lastSyncAt
              ? `Last sync ${new Date(row.lastSyncAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                })}`
              : "Never synced — sync job lands with this provider's module"}
          </span>
        </p>
      </div>

      {row.webhookPath && !revoked && (
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(
              `${window.location.origin}${row.webhookPath}`,
            )
          }
          className="text-faint hover:text-foreground rounded-md border px-2 py-1 font-mono text-[10px] transition-colors"
          title="Copy the webhook URL to paste into the processor"
        >
          copy webhook URL
        </button>
      )}

      <span
        className={cn(
          "rounded-full border px-1.5 text-[11px]",
          row.clientName ? "text-muted-foreground" : "border-brand/30 text-brand",
        )}
      >
        {row.clientName ?? "Agency"}
      </span>

      <StatusPill tone={revoked ? "muted" : "live"}>
        {revoked ? "Revoked" : "Connected"}
      </StatusPill>

      {!revoked && (
        <button
          disabled={pending}
          onClick={() => act(() => revokeIntegration(row.id))}
          className="text-faint hover:text-foreground rounded-md border px-2 py-1 text-[11px] transition-colors"
        >
          Revoke
        </button>
      )}
      <button
        aria-label="Delete connection"
        disabled={pending}
        onClick={() => act(() => deleteIntegration(row.id))}
        className="text-faint hover:text-destructive transition-colors"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function IntegrationsPanel({
  connections,
  teams,
}: {
  connections: ConnectionRow[];
  teams: TeamOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(PROVIDERS[0].value);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = providerByValue(provider);
  const connectedValues = new Set(
    connections.filter((c) => c.status !== "revoked").map((c) => c.provider),
  );

  function connect() {
    if (label.trim() === "" || secret.trim() === "") return;
    setError(null);
    start(async () => {
      try {
        await connectIntegration({
          provider,
          label,
          secret,
          clientId: scope || null,
        });
        toast({
          tone: "success",
          title: "Sealed and connected",
          detail: "The key is encrypted — only its last 4 characters stay visible.",
        });
        setLabel("");
        setSecret("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="integrations."
        description="Every tool feeding GV OS, connected once. Credentials are sealed with AES-256-GCM before they touch the database — this page only ever sees the last four characters. Scope a connection to a client to keep their credentials in their lane."
        status={
          <StatusPill tone="live">
            {connectedValues.size} of {PROVIDERS.length} connected
          </StatusPill>
        }
      />

      <Panel title="Connect a tool">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Tool</span>
              <select
                className={cn(selectClass, "w-48")}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDER_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {PROVIDERS.filter((p) => p.group === group).map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Label</span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='e.g. "Grid Close account"'
              />
            </label>
            <label className="min-w-[14rem] flex-1 space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                {selected ? CREDENTIAL_LABELS[selected.credential] : "Credential"}
              </span>
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Pasted once, sealed, never shown again"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Scope</span>
              <select
                className={cn(selectClass, "w-40")}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="">Agency</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={connect}
              disabled={pending || label.trim() === "" || secret.trim() === ""}
              className="gap-2"
            >
              <Plus className="size-3.5" /> Connect
            </Button>
          </div>
          {selected && (
            <p className="text-faint text-xs">
              <Plug className="mr-1 inline size-3" />
              Feeds: {selected.feeds}
            </p>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </Panel>

      {connections.length === 0 ? (
        <Panel title="Connections">
          <p className="text-faint py-8 text-center text-sm">
            Nothing connected yet. Start with a payment processor — payment events feed
            the ledger first.
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
            Connections
          </h2>
          {connections.map((row) => (
            <ConnectionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
