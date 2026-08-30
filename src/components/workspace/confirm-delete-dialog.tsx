"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";

/**
 * A clean, in-app delete confirmation — the replacement for the native
 * `window.confirm`, which leaked the domain and the literal word "Untitled"
 * into a browser chrome popup the user hated.
 *
 * It shows the page's REAL title, is a single fast click to confirm, and is
 * built on Base UI's AlertDialog so focus, Escape, and backdrop-dismiss behave
 * like the rest of the app. Controlled: the parent owns `open` and both actions.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  /** The actual page title — never "Untitled" for a page that has a name. */
  title: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[2px]" />
        <AlertDialog.Popup className="bg-popover text-popover-foreground elev-raised fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <AlertDialog.Title className="text-foreground text-base font-semibold tracking-tight">
            Delete “{title || "Untitled"}”?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            This page and its sub-pages will be permanently deleted.
          </AlertDialog.Description>

          <div className="mt-5 flex items-center justify-end gap-2">
            <AlertDialog.Close
              disabled={pending}
              className="hover:bg-secondary/60 hover:text-foreground text-muted-foreground press rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className={cn(
                "bg-destructive press rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[color-mix(in_oklch,var(--destructive),black_10%)] disabled:opacity-50",
              )}
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
