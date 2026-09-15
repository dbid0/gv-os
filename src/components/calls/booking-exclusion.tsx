"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { EyeOff, RotateCcw } from "lucide-react";

import {
  excludeBookingAction,
  restoreBookingAction,
} from "@/app/w/[slug]/calls/exclusion-actions";

/**
 * Take one call out of the numbers — a test booking, a duplicate, an internal
 * meeting on the sales link. Asks why first; the call moves to the restore bin
 * at the bottom of the page.
 */
export function ExcludeBookingButton({
  slug,
  bookingId,
}: {
  slug: string;
  bookingId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const res = await excludeBookingAction(slug, bookingId, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Take this call out of the numbers"
        title="Take this call out of the numbers"
        className="text-faint hover:text-foreground rounded-md p-1"
      >
        <EyeOff className="size-3.5" />
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="why? e.g. test booking"
        aria-label="Why this call is out of the numbers"
        maxLength={200}
        className="bg-card h-7 w-44 rounded-md border px-2 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="border-warning/50 text-warning hover:bg-warning/10 rounded-md border px-2 py-1 text-xs"
      >
        {pending ? "Removing…" : "Remove from numbers"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-faint text-xs hover:underline"
      >
        Keep
      </button>
      {error && <span className="text-warning w-full text-xs">{error}</span>}
    </form>
  );
}

export function RestoreBookingButton({
  slug,
  bookingId,
}: {
  slug: string;
  bookingId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await restoreBookingAction(slug, bookingId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
        className="hover:bg-secondary/70 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
      >
        <RotateCcw className="size-3" /> {pending ? "Restoring…" : "Put back"}
      </button>
      {error && <span className="text-warning text-xs">{error}</span>}
    </span>
  );
}
