"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { Checkbox } from "@base-ui/react/checkbox";
import { Check, Copy, Globe, Link2 } from "lucide-react";

import { createShare, getShareState, revokeShare } from "@/app/(app)/workspace/actions";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * The Notion-style "Share" dialog for a Workspace page.
 *
 * A single "Share to web" switch is the master control: ON creates a public,
 * view-only link (and shows it with a Copy button); OFF revokes it. An "Include
 * sub-pages" checkbox toggles whether the page's descendants are browsable under
 * the same token, and a "Copy page link" row copies the in-app `?page=` URL for
 * teammates who are logged in. Everything is driven by the auth-gated server
 * actions — the dialog never touches the database directly.
 *
 * Controlled: the parent (the page header's Share button) owns `open`. The BODY
 * is mounted fresh on each open, so its state starts from clean initializers and
 * the current share is re-fetched every time — no stale link ever shows.
 */
export function ShareDialog({
  open,
  onOpenChange,
  pageId,
  inAppUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page being shared. */
  pageId: string;
  /** The logged-in `?page=` link, for the "Copy page link" row. */
  inAppUrl: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Popup className="bg-popover text-popover-foreground elev-raised fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-foreground text-base font-semibold tracking-tight">
            Share
          </Dialog.Title>
          {open && <ShareDialogBody pageId={pageId} inAppUrl={inAppUrl} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShareDialogBody({ pageId, inAppUrl }: { pageId: string; inAppUrl: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [includeChildren, setIncludeChildren] = useState(true);
  const [copied, setCopied] = useState(false);

  const shared = token !== null;
  const publicUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : "";

  // Load the current share state once, on mount — the body is remounted each
  // time the dialog opens, so this always reflects what's actually live. State
  // is only written from the async callbacks, never synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    getShareState(pageId)
      .then((state) => {
        if (cancelled) return;
        setToken(state?.token ?? null);
        setIncludeChildren(state?.includeChildren ?? true);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const toggleShare = (next: boolean) => {
    start(async () => {
      try {
        if (next) {
          const { token: t } = await createShare(pageId, { includeChildren });
          setToken(t);
        } else {
          await revokeShare(pageId);
          setToken(null);
          setCopied(false);
        }
      } catch (e) {
        toast({
          tone: "error",
          title: next ? "Couldn't create the link" : "Couldn't disable the link",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  };

  const changeIncludeChildren = (next: boolean) => {
    setIncludeChildren(next);
    if (!shared) return;
    start(async () => {
      try {
        await createShare(pageId, { includeChildren: next });
      } catch (e) {
        toast({
          tone: "error",
          title: "Couldn't update the link",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  };

  const copyPublic = async () => {
    const ok = await copyText(publicUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    toast(
      ok
        ? { tone: "success", title: "Public link copied" }
        : { tone: "error", title: "Couldn't copy the link", detail: publicUrl },
    );
  };

  const copyInApp = async () => {
    const ok = await copyText(inAppUrl);
    toast(
      ok
        ? { tone: "success", title: "Page link copied" }
        : { tone: "error", title: "Couldn't copy the link", detail: inAppUrl },
    );
  };

  return (
    <>
      {/* Share to web — the master switch. */}
      <div className="mt-4 flex items-center gap-3">
        <span className="bg-secondary/60 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
          <Globe className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">Share to web</p>
          <p className="text-muted-foreground text-[0.8125rem] leading-snug">
            Anyone with the link can view this page.
          </p>
        </div>
        <Switch.Root
          checked={shared}
          onCheckedChange={toggleShare}
          disabled={loading || pending}
          className={cn(
            "relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
            "bg-input data-checked:bg-brand",
            "focus-visible:ring-brand/50 focus-visible:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Switch.Thumb className="size-[18px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-[18px]" />
        </Switch.Root>
      </div>

      {shared && (
        <div className="mt-4 space-y-3">
          {/* The public link + copy. */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={publicUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-secondary/50 text-muted-foreground focus-visible:ring-brand/40 min-w-0 flex-1 truncate rounded-md border px-2.5 py-1.5 text-[0.8125rem] outline-none focus-visible:ring-2"
            />
            <button
              type="button"
              onClick={copyPublic}
              className="bg-primary text-primary-foreground press inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.8125rem] font-medium"
            >
              {copied ? (
                <>
                  <Check className="size-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copy
                </>
              )}
            </button>
          </div>

          {/* Include sub-pages. */}
          <label className="hover:bg-secondary/40 -mx-1 flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors">
            <Checkbox.Root
              checked={includeChildren}
              onCheckedChange={changeIncludeChildren}
              disabled={pending}
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors outline-none",
                "bg-secondary/50 data-checked:bg-brand data-checked:border-brand",
                "focus-visible:ring-brand/50 focus-visible:ring-2",
                "disabled:opacity-50",
              )}
            >
              <Checkbox.Indicator>
                <Check className="size-3.5 text-white" />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="text-foreground text-[0.8125rem] select-none">
              Include sub-pages
            </span>
          </label>
        </div>
      )}

      <div className="border-border/60 my-4 border-t" />

      {/* Copy the in-app link (for logged-in teammates). */}
      <button
        type="button"
        onClick={copyInApp}
        className="hover:bg-secondary/50 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors"
      >
        <span className="text-muted-foreground grid size-8 shrink-0 place-items-center">
          <Link2 className="size-4" />
        </span>
        <span className="text-foreground min-w-0 flex-1 text-sm font-medium">
          Copy page link
        </span>
        <span className="text-faint pr-1 text-[0.75rem]">In-app</span>
      </button>

      <p className="text-faint mt-4 text-[0.75rem] leading-snug">
        Anyone with the link can view this page (read-only). They can&apos;t edit.
      </p>
    </>
  );
}
