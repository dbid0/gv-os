"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { restoreEocAction, voidEocAction } from "@/lib/calls/eoc-actions";

/**
 * Void and restore for one report. Voiding moves it to the restore bin — its
 * outcome stops counting everywhere at once — and restoring brings it back
 * exactly as filed. Nothing is ever hard-deleted.
 */
export function EocReportAction({
  slug,
  reportId,
  mode,
}: {
  slug: string;
  reportId: string;
  mode: "void" | "restore";
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError(null);
      const res =
        mode === "void"
          ? await voidEocAction(slug, reportId)
          : await restoreEocAction(slug, reportId);
      if (!res.ok) setError(res.errors[0]);
      setConfirming(false);
    });

  if (mode === "restore") {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="hover:bg-secondary/70 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
        >
          <RotateCcw className="size-3" /> {pending ? "Restoring…" : "Restore"}
        </button>
        {error && <span className="text-warning text-xs">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 rounded-md border px-2 py-1 text-xs"
          >
            {pending ? "Voiding…" : "Void report"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-faint text-xs hover:underline"
          >
            Keep
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Void this report"
          className="hover:bg-secondary/70 rounded-md border p-1.5"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      {error && <span className="text-warning text-xs">{error}</span>}
    </span>
  );
}
