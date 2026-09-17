"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { KeyRound, Link2, Plug, Plus, Trash2, Webhook, X } from "lucide-react";

import {
  connectIntegration,
  deleteIntegration,
  revokeIntegration,
  saveWebhookSecret,
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
  type Provider,
  type SyncStatus,
} from "@/lib/integrations/providers";
import { providerLogo } from "@/lib/integrations/logos";
import { isFailureNote, isStaleSync } from "@/lib/integrations/sync-note";
import { cn } from "@/lib/utils";
import { useViewerTimeZone } from "@/components/shell/time-zone";

interface TeamOption {
  id: string;
  name: string;
}

/** Serializable mirror of IntegrationRow (dates as ISO strings). */
interface ConnectionRow {
  id: string;
  provider: string;
  hasWebhookSecret: boolean;
  label: string;
  clientId: string | null;
  clientName: string | null;
  /** "archived" when the client is retired — muted, sunk to the end. */
  clientStatus: string | null;
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
  webhook: "Paste the webhook URL into the tool to start",
  none: "No sync built yet — key stored",
};

type StatusFilter = "all" | "connected" | "not_connected";
type SortMode = "connected_first" | "az";

/**
 * A short monogram for a provider, standing in for a brand logo we don't ship.
 * Two initials for multi-word names, else the first two letters — enough to keep
 * every tile distinct within its category.
 */
function ProviderMark({
  value,
  label,
  connected,
}: {
  value: string;
  label: string;
  connected?: boolean;
}) {
  const logo = providerLogo(value);
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tracking-tight",
        logo
          ? "bg-white"
          : connected
            ? "border-brand/40 bg-brand-soft/40 text-brand"
            : "bg-secondary text-muted-foreground",
      )}
      aria-hidden
    >
      {logo ? (
        // A plain <img> on a white chip: the marks are vendored in their own
        // brand colours, so they need a light surface to stay legible in dark
        // mode, and the image optimizer has nothing to do with a static SVG.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-5 object-contain" />
      ) : (
        lettermark(label)
      )}
    </span>
  );
}

function lettermark(label: string): string {
  const words = label.replace(/[()]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

/** A single stored connection, rendered compactly inside its provider card. */
function ConnectionRowItem({ row }: { row: ConnectionRow }) {
  const viewerZone = useViewerTimeZone();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const syncStatus = providerSyncStatus(row.provider);
  const revoked = row.status === "revoked";
  const stale = isStaleSync(row.lastSyncAt, new Date());

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
        "bg-secondary/40 rounded-lg border p-2.5 text-xs",
        revoked && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground min-w-0 truncate font-medium">
          {row.label}
        </span>
        <StatusPill tone={revoked ? "muted" : "live"} className="shrink-0">
          {revoked ? "Revoked" : "Connected"}
        </StatusPill>
      </div>

      <p className="text-faint mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
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
        <span className={cn(stale && "text-warning font-medium")}>
          {row.lastSyncAt
            ? `${stale ? "No successful sync since" : "Synced"} ${new Date(
                row.lastSyncAt,
              ).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: viewerZone,
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

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full border px-1.5 text-[11px]",
            row.clientName ? "text-muted-foreground" : "border-brand/30 text-brand",
          )}
        >
          {row.clientName ?? "Agency"}
          {row.clientStatus === "archived" && " · archived"}
        </span>

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
        {row.provider === "stripe" && row.webhookPath && !revoked && (
          <WebhookSecretField integrationId={row.id} hasSecret={row.hasWebhookSecret} />
        )}

        <span className="grow" />

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
    </div>
  );
}

/** One provider in the catalog grid: identity, sync status, and its connections. */
function ProviderCard({
  provider,
  rows,
  onConnect,
}: {
  provider: Provider;
  rows: ConnectionRow[];
  onConnect: (value: string) => void;
}) {
  const syncStatus = providerSyncStatus(provider.value);
  const connected = rows.some((r) => r.status !== "revoked");

  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-xl border p-4 transition-colors",
        connected ? "border-brand/40" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start gap-3">
        <ProviderMark
          value={provider.value}
          label={provider.label}
          connected={connected}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-foreground truncate text-sm font-medium">
              {provider.label}
            </span>
            <StatusPill tone={SYNC_TONE[syncStatus]}>
              {SYNC_STATUS_LABEL[syncStatus]}
            </StatusPill>
          </div>
          <p className="text-faint mt-0.5 flex items-center gap-1 text-[11px]">
            <Plug className="size-3 shrink-0" /> Feeds: {provider.feeds}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <ConnectionRowItem key={row.id} row={row} />
          ))}
        </div>
      )}

      <div className="mt-3">
        {connected ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onConnect(provider.value)}
            className="text-muted-foreground gap-1.5"
          >
            <Plus className="size-3.5" /> Add another
          </Button>
        ) : rows.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onConnect(provider.value)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" /> Reconnect
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onConnect(provider.value)}
            className="gap-1.5"
          >
            <Plug className="size-3.5" /> Connect
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The connect flow, pre-selected to one provider. A modal built on our Dialog
 * primitive so it traps focus and closes on Escape. The Root stays mounted and
 * controlled; the form itself remounts per provider (keyed) so it always opens
 * clean — no reset effect needed.
 */
function ConnectDialog({
  providerValue,
  teams,
  fixedClientId,
  onClose,
}: {
  providerValue: string | null;
  teams: TeamOption[];
  fixedClientId?: string;
  onClose: () => void;
}) {
  const selected = providerValue ? providerByValue(providerValue) : undefined;

  return (
    <Dialog.Root
      open={providerValue !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-lg transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
          {selected && (
            <ConnectForm
              key={selected.value}
              provider={selected}
              teams={teams}
              fixedClientId={fixedClientId}
              onDone={onClose}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The connect form body. Remounted per provider by its key, so every field
 * starts from that provider's defaults with no synchronous reset effect. Renders
 * the same fields the old inline form did and calls the same action.
 */
function ConnectForm({
  provider: selected,
  teams,
  fixedClientId,
  onDone,
}: {
  provider: Provider;
  teams: TeamOption[];
  fixedClientId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<ConnectMethod>(() => defaultMethod(selected));
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [reference, setReference] = useState("");
  const [scope, setScope] = useState(fixedClientId ?? "");
  const [error, setError] = useState<string | null>(null);

  const methods = methodsForProvider(selected);

  // api_key needs a secret; webhook and manual don't.
  const ready = label.trim() !== "" && (method !== "api_key" || secret.trim() !== "");

  function connect() {
    if (!ready) return;
    setError(null);
    start(async () => {
      try {
        await connectIntegration({
          provider: selected.value,
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
              ? providerSyncStatus(selected.value) === "auto"
                ? "Connected — pulling your data now"
                : "Sealed and connected"
              : method === "webhook"
                ? "Connected — copy the webhook URL on the card"
                : "Marked connected",
          detail:
            method === "api_key"
              ? "The key is sealed, and it now syncs automatically — no button needed."
              : undefined,
        });
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect.");
      }
    });
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="border-brand/40 bg-brand-soft/40 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold"
            aria-hidden
          >
            {lettermark(selected.label)}
          </span>
          <div>
            <Dialog.Title className="text-foreground text-sm font-medium">
              Connect {selected.label}
            </Dialog.Title>
            <Dialog.Description className="text-faint text-[11px]">
              Feeds: {selected.feeds}
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close
          render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
        >
          <X className="size-4" />
        </Dialog.Close>
      </header>

      <div className="space-y-3 px-5 py-4">
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Label</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. "Grid Close account"'
            autoFocus
          />
        </label>

        {methods.length > 1 && (
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Method</span>
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
          </div>
        )}

        {method === "api_key" ? (
          <label className="block space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              {CREDENTIAL_LABELS[selected.credential]}
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
          <label className="block space-y-1.5">
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
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Credential
            </span>
            <p className="text-faint flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs">
              <Webhook className="size-3.5 shrink-0" /> A webhook URL is minted on
              connect — copy it from the card.
            </p>
          </div>
        )}

        {!fixedClientId && (
          <label className="block space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Scope</span>
            <select
              className={cn(selectClass, "w-full")}
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

        <p className="text-faint text-xs">{METHOD_HINTS[method]}</p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
        <Dialog.Close render={<Button variant="ghost" size="lg" />}>
          Cancel
        </Dialog.Close>
        <Button
          size="lg"
          onClick={connect}
          disabled={pending || !ready}
          className="gap-2"
        >
          <Plus className="size-3.5" /> Connect
        </Button>
      </footer>
    </>
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
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("connected_first");

  const connectedValues = useMemo(
    () =>
      new Set(connections.filter((c) => c.status !== "revoked").map((c) => c.provider)),
    [connections],
  );

  // Connections keyed by provider, live before revoked so the card leads with
  // its working connection.
  const rowsByProvider = useMemo(() => {
    const map = new Map<string, ConnectionRow[]>();
    for (const c of connections) {
      const list = map.get(c.provider) ?? [];
      list.push(c);
      map.set(c.provider, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => Number(a.status === "revoked") - Number(b.status === "revoked"),
      );
    }
    return map;
  }, [connections]);

  // Catalog grouped by category, filtered and sorted client-side.
  const groups = useMemo(() => {
    return PROVIDER_GROUPS.filter((g) => category === "" || category === g)
      .map((g) => {
        const items = PROVIDERS.filter((p) => p.group === g)
          .filter((p) => {
            const isConn = connectedValues.has(p.value);
            if (status === "connected") return isConn;
            if (status === "not_connected") return !isConn;
            return true;
          })
          .sort((a, b) => {
            if (sort === "connected_first") {
              const rank =
                Number(!connectedValues.has(a.value)) -
                Number(!connectedValues.has(b.value));
              if (rank !== 0) return rank;
            }
            return a.label.localeCompare(b.label);
          });
        return { group: g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [category, status, sort, connectedValues]);

  const chips = (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone="live">
        {connectedValues.size} of {PROVIDERS.length} connected
      </StatusPill>
      <StatusPill tone="muted">
        <Plug className="size-3" /> {PROVIDERS.length} available
      </StatusPill>
    </div>
  );

  return (
    <div className={cn("space-y-6", !embedded && "mx-auto w-full max-w-7xl")}>
      {!embedded ? (
        <PageHeader title="The" highlight="integrations." status={chips} />
      ) : (
        chips
      )}

      {/* Filter / sort row. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by category"
          className={selectClass}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {PROVIDER_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="connected">Connected</option>
          <option value="not_connected">Not connected</option>
        </select>
        <select
          aria-label="Sort"
          className={selectClass}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          <option value="connected_first">Connected first</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      {connections.length === 0 && (
        <Panel padded={false}>
          <p className="text-faint px-5 py-4 text-sm">
            Nothing connected yet. Start with a payment processor — payment events feed
            the ledger first.
          </p>
        </Panel>
      )}

      {groups.length === 0 ? (
        <p className="text-faint py-10 text-center text-sm">
          No tools match these filters.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-3">
              <h2 className="text-muted-foreground flex items-center gap-2 px-1 text-xs font-medium tracking-wide uppercase">
                {group}
                <span className="text-faint tabular-nums">{items.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((provider) => (
                  <ProviderCard
                    key={provider.value}
                    provider={provider}
                    rows={rowsByProvider.get(provider.value) ?? []}
                    onConnect={setConnectFor}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConnectDialog
        providerValue={connectFor}
        teams={teams}
        fixedClientId={fixedClientId}
        onClose={() => setConnectFor(null)}
      />
    </div>
  );
}

/**
 * The Stripe signing-secret slot beside a connection's webhook URL. Saved
 * secrets are sealed server-side; once one exists every delivery must carry
 * a valid Stripe-Signature. Clearing it returns the endpoint to
 * capability-URL-only.
 */
function WebhookSecretField({
  integrationId,
  hasSecret,
}: {
  integrationId: string;
  hasSecret: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "rounded-md border px-2 py-1 text-[10px] transition-colors",
          hasSecret
            ? "text-success hover:text-foreground"
            : "text-faint hover:text-foreground",
        )}
        title="Stripe webhook signing secret — deliveries are HMAC-verified once saved"
      >
        {hasSecret ? "signature ✓" : "add signing secret"}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="whsec_…"
        className="bg-secondary/60 text-foreground w-40 rounded border px-1.5 py-0.5 font-mono text-[10px]"
        aria-label="Stripe webhook signing secret"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await saveWebhookSecret(integrationId, value);
            if (!res.ok) setError(res.reason ?? "Could not save.");
            else {
              setEditing(false);
              setValue("");
            }
          })
        }
        className="bg-secondary text-foreground rounded border px-1.5 py-0.5 text-[10px] font-medium"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        className="text-faint text-[10px]"
      >
        Cancel
      </button>
      {error && <span className="text-warning text-[10px]">{error}</span>}
    </span>
  );
}
