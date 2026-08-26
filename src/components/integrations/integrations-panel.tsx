"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, Plug, Plus, Trash2, Webhook } from "lucide-react";

import {
  connectIntegration,
  deleteIntegration,
  revokeIntegration,
} from "@/app/(app)/settings/integrations/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import {
  CREDENTIAL_LABELS,
  METHOD_HINTS,
  METHOD_LABELS,
  PROVIDER_GROUPS,
  PROVIDERS,
  SYNC_STATUS_LABEL,
  defaultMethod,
  methodsForProvider,
  providerByValue,
  providerSyncStatus,
  type ConnectMethod,
  type SyncStatus,
} from "@/lib/integrations/providers";
import { isFailureNote } from "@/lib/integrations/sync-note";
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
  method: string;
  reference: string | null;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const SYNC_TONE: Record<SyncStatus, StatusTone> = {
  auto: "good",
  webhook: "progress",
  none: "muted",
};
/** What a not-yet-synced connection is waiting on, by how it flows. */
const SYNC_PENDING_COPY: Record<SyncStatus, string> = {
  auto: "Auto-syncing — first pull runs on connect",
  webhook: "Paste the webhook URL above into the tool to start",
  none: "No sync built yet — key stored",
};

function ConnectionCard({ row }: { row: ConnectionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const provider = providerByValue(row.provider);
  const syncStatus = providerSyncStatus(row.provider);
  const revoked = row.status === "revoked";

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Action failed.",
        });
      }
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
          {row.method === "webhook" && (
            <span className="inline-flex items-center gap-1">
              <Webhook className="size-3" /> webhook
            </span>
          )}
          {row.method === "manual" && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3" />
              {row.reference ? (
                <a
                  href={row.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline"
                >
                  manual
                </a>
              ) : (
                "manual"
              )}
            </span>
          )}
          <span>
            {row.lastSyncAt
              ? `Synced ${new Date(row.lastSyncAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                })}`
              : SYNC_PENDING_COPY[syncStatus]}
          </span>
          {row.lastSyncNote && (
            <span
              className={cn(
                "truncate",
                isFailureNote(row.lastSyncNote) && "text-warning font-medium",
              )}
            >
              {row.lastSyncNote}
            </span>
          )}
        </p>
      </div>

      {!revoked && (
        <StatusPill tone={SYNC_TONE[syncStatus]}>
          {SYNC_STATUS_LABEL[syncStatus]}
        </StatusPill>
      )}

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
  fixedClientId,
  embedded = false,
}: {
  connections: ConnectionRow[];
  teams: TeamOption[];
  /** When set, every new connection pins to this client and the scope picker is hidden. */
  fixedClientId?: string;
  /** Drop the page header when rendered inside another page (e.g. an offer). */
  embedded?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(PROVIDERS[0].value);
  const [method, setMethod] = useState<ConnectMethod>(defaultMethod(PROVIDERS[0]));
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [reference, setReference] = useState("");
  const [scope, setScope] = useState(fixedClientId ?? "");
  const [error, setError] = useState<string | null>(null);

  const selected = providerByValue(provider);
  const methods = selected ? methodsForProvider(selected) : (["api_key"] as const);
  const connectedValues = new Set(
    connections.filter((c) => c.status !== "revoked").map((c) => c.provider),
  );

  // Changing the tool resets the method to that tool's best option.
  function pickProvider(value: string) {
    setProvider(value);
    const p = providerByValue(value);
    if (p) setMethod(defaultMethod(p));
    setSecret("");
    setReference("");
  }

  // api_key needs a secret; webhook and manual don't.
  const ready = label.trim() !== "" && (method !== "api_key" || secret.trim() !== "");

  function connect() {
    if (!ready) return;
    setError(null);
    start(async () => {
      try {
        await connectIntegration({
          provider,
          label,
          method,
          secret: method === "api_key" ? secret : undefined,
          reference: method === "manual" ? reference : undefined,
          clientId: scope || null,
        });
        toast({
          tone: "success",
          title:
            method === "api_key"
              ? selected && providerSyncStatus(selected.value) === "auto"
                ? "Connected — pulling your data now"
                : "Sealed and connected"
              : method === "webhook"
                ? "Connected — copy the webhook URL below"
                : "Marked connected",
          detail:
            method === "api_key"
              ? "The key is sealed, and it now syncs automatically — no button needed."
              : undefined,
        });
        setLabel("");
        setSecret("");
        setReference("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect.");
      }
    });
  }

  return (
    <div className={cn("space-y-6", !embedded && "mx-auto w-full max-w-7xl")}>
      {!embedded && (
        <PageHeader
          title="The"
          highlight="integrations."
          status={
            <StatusPill tone="live">
              {connectedValues.size} of {PROVIDERS.length} connected
            </StatusPill>
          }
        />
      )}

      <Panel title="Connect a tool">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">Tool</span>
              <select
                className={cn(selectClass, "w-48")}
                value={provider}
                onChange={(e) => pickProvider(e.target.value)}
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
            {methods.length > 1 && (
              <label className="space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  Method
                </span>
                <div className="bg-secondary/60 inline-flex h-9 items-center rounded-md border p-0.5">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs transition-colors",
                        method === m
                          ? "bg-card text-foreground border-border-strong border font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </label>
            )}
            {method === "api_key" ? (
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
            ) : method === "manual" ? (
              <label className="min-w-[14rem] flex-1 space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  Reference <span className="text-faint font-normal">(optional)</span>
                </span>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Link or note — where this is set up"
                />
              </label>
            ) : (
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  Credential
                </span>
                <p className="text-faint flex h-9 items-center gap-1.5 rounded-md border border-dashed px-3 text-xs">
                  <Webhook className="size-3.5 shrink-0" /> A webhook URL is minted on
                  connect — copy it from the connection below.
                </p>
              </div>
            )}
            {!fixedClientId && (
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
            )}
            <Button onClick={connect} disabled={pending || !ready} className="gap-2">
              <Plus className="size-3.5" /> Connect
            </Button>
          </div>
          {selected && (
            <p className="text-faint flex flex-wrap items-center gap-x-2 text-xs">
              <span>
                <Plug className="mr-1 inline size-3" />
                Feeds: {selected.feeds}
              </span>
              <StatusPill tone={SYNC_TONE[providerSyncStatus(selected.value)]}>
                {providerSyncStatus(selected.value) === "auto"
                  ? "Syncs automatically"
                  : providerSyncStatus(selected.value) === "webhook"
                    ? "Pushes via webhook"
                    : "No sync built yet"}
              </StatusPill>
            </p>
          )}
          <p className="text-faint text-xs">{METHOD_HINTS[method]}</p>
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
