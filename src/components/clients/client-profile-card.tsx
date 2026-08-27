"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowRight, Camera, Check, Pencil, Settings2, X } from "lucide-react";

import { saveClientSummary } from "@/app/(app)/clients/[slug]/actions";
import { saveWorkspaceLogo } from "@/app/w/[slug]/logo-actions";
import { ClientLogo } from "@/components/clients/client-logo";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const SIZE = 256;

/** Center-crop to a square PNG data URL — same as the workspace uploader. */
async function toLogoDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    const side = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ClientCard {
  slug: string;
  name: string;
  owner: string;
  category: string;
  /** The short 3–8 word offer summary (DB override ?? roster default). */
  summary: string;
  since: string;
  accent: string;
}

/**
 * A client as a profile card (Daniel wants the Clients tab to read like the
 * Sales team profiles). The logo is click-to-upload right here — the same
 * place you manage the client, so a missing mark (e.g. The Visionary) is one
 * click to fix without leaving the roster.
 */
export function ClientProfileCard({ client }: { client: ClientCard }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client.summary);
  const [saving, startSave] = useTransition();
  // The logo image route is cached, so router.refresh() alone won't repaint a
  // just-uploaded logo. Hold the fresh data URL locally to keep the upload's
  // instant feedback; the cached route takes over on the next full load.
  const [freshLogo, setFreshLogo] = useState<string | null>(null);

  const cancelEdit = () => {
    setDraft(client.summary);
    setEditing(false);
  };

  const saveSummary = () =>
    startSave(async () => {
      try {
        await saveClientSummary(client.slug, draft);
        setEditing(false);
        toast({ tone: "success", title: `${client.name} summary updated` });
        router.refresh();
      } catch (err) {
        toast({
          tone: "error",
          title: err instanceof Error ? err.message : "Could not save.",
        });
      }
    });

  return (
    <div className="bg-card hover:border-brand/40 relative flex flex-col overflow-hidden rounded-xl border transition-colors">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: client.accent }}
      />

      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          title="Change logo"
          aria-label={`Change ${client.name} logo`}
          className={cn(
            "group relative shrink-0 rounded-lg transition-transform hover:scale-[1.04] active:scale-95",
            pending && "opacity-60",
          )}
        >
          {freshLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- fresh local upload preview (data URL); the cached route serves it on next load
            <img
              src={freshLogo}
              alt=""
              className="size-11 rounded-lg border object-cover"
            />
          ) : (
            <ClientLogo
              slug={client.slug}
              name={client.name}
              accent={client.accent}
              size={44}
            />
          )}
          <span className="bg-background/70 absolute inset-0 grid place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-4" />
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-logo-input={client.slug}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            start(async () => {
              try {
                const dataUrl = await toLogoDataUrl(file);
                await saveWorkspaceLogo(client.slug, dataUrl);
                setFreshLogo(dataUrl);
                toast({ tone: "success", title: `${client.name} logo updated` });
                router.refresh();
              } catch (err) {
                toast({
                  tone: "error",
                  title: err instanceof Error ? err.message : "Upload failed.",
                });
              }
            });
          }}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold tracking-tight">{client.name}</h3>
          <p className="text-muted-foreground text-xs">
            {client.owner} · {client.category}
          </p>
        </div>
        <StatusPill tone="live">Active</StatusPill>
      </div>

      {/* The short offer summary — what the offer is, in a few words. Editable
          in place: hover reveals the pencil, Enter saves, Esc cancels. */}
      <div className="group/summary px-4">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              maxLength={64}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSummary();
                if (e.key === "Escape") cancelEdit();
              }}
              placeholder="e.g. AI phone farm for agencies"
              className="border-input bg-background focus-visible:border-brand min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              onClick={saveSummary}
              disabled={saving}
              aria-label="Save summary"
              className="text-brand hover:bg-brand-soft/50 grid size-7 shrink-0 place-items-center rounded-md transition-colors"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel"
              className="text-muted-foreground hover:bg-secondary grid size-7 shrink-0 place-items-center rounded-md transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit summary"
            className="hover:bg-secondary/50 -mx-1 flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors"
          >
            <span className="text-muted-foreground truncate text-sm">
              {client.summary}
            </span>
            <Pencil className="text-faint size-3 shrink-0 opacity-0 transition-opacity group-hover/summary:opacity-100" />
          </button>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t p-3">
        <Link
          href={`/w/${client.slug}`}
          className="bg-secondary/60 hover:bg-secondary text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Open workspace <ArrowRight className="size-3" />
        </Link>
        <Link
          href={`/clients/${client.slug}`}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
        >
          <Settings2 className="size-3.5" /> Manage
        </Link>
      </div>
    </div>
  );
}
