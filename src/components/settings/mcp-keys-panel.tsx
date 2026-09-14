"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import {
  createMcpKeyAction,
  revokeMcpKeyAction,
} from "@/app/(app)/settings/mcp/actions";
import { cn } from "@/lib/utils";

export type McpKeyListRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "never";

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-faint text-[11px]">{label}</p>
      <div className="bg-secondary/40 flex items-start gap-2 rounded-md border p-2">
        <code className="min-w-0 flex-1 text-xs break-all whitespace-pre-wrap">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
          }}
          aria-label={`Copy ${label}`}
          className="hover:bg-secondary/70 shrink-0 rounded border p-1"
        >
          {copied ? (
            <Check className="text-success size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Create, see and revoke the API keys an owner's own Claude uses to read GV OS.
 * A new key is shown exactly once, with the connect command ready to paste;
 * after that only its non-secret label is ever displayed.
 */
export function McpKeysPanel({
  endpoint,
  keys,
}: {
  endpoint: string;
  keys: McpKeyListRow[];
}) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      const res = await createMcpKeyAction(name);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setFresh({ name, key: res.key });
      setName("");
    });

  const revoke = (id: string) =>
    startTransition(async () => {
      setError(null);
      const res = await revokeMcpKeyAction(id);
      if (!res.ok) setError(res.reason);
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-faint text-[11px]">
          New key for
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. office laptop"
            className="bg-secondary/60 text-foreground mt-0.5 block w-64 rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="bg-brand text-brand-foreground press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <KeyRound className="size-3.5" /> {pending ? "Creating…" : "Create key"}
        </button>
        {error && <p className="text-warning w-full text-xs">{error}</p>}
      </div>

      {fresh && (
        <div className="border-success/40 bg-success/5 space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Key for {fresh.name} created. Copy it now — it won&apos;t be shown again.
          </p>
          <CopyBlock label="API key" value={fresh.key} />
          <CopyBlock
            label="Connect Claude Code"
            value={`claude mcp add --transport http gv-os ${endpoint} --header "Authorization: Bearer ${fresh.key}"`}
          />
          <p className="text-faint text-xs">
            In the Claude app, add a custom connector with URL {endpoint} and the same
            Authorization header.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {keys.length === 0 ? (
          <p className="text-faint text-sm">No keys yet.</p>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5 text-sm",
                k.revokedAt && "opacity-60",
              )}
            >
              <span className="font-medium">{k.name}</span>
              <code className="text-faint text-xs">{k.keyPrefix}…</code>
              <span className="text-faint text-xs">
                created {when(k.createdAt)} · last used {when(k.lastUsedAt)}
              </span>
              <span className="ml-auto">
                {k.revokedAt ? (
                  <span className="text-faint text-xs">
                    revoked {when(k.revokedAt)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revoke(k.id)}
                    disabled={pending}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-md border px-2 py-1 text-xs"
                  >
                    Revoke
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
