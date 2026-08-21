"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { syncFinanceSheet } from "@/app/(app)/accounting/reconciliation/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SyncSheetButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function sync() {
    setError(null);
    start(async () => {
      try {
        const summary = await syncFinanceSheet();
        toast({
          tone: summary.totalAbsDriftCents === 0 ? "success" : "info",
          title: `${summary.rowCount} deals reconciled`,
          detail:
            summary.totalAbsDriftCents === 0
              ? "To the cent — sheet and engine agree."
              : `${summary.driftRowCount} rows drift ($${(summary.totalAbsDriftCents / 100).toFixed(2)} total).`,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button onClick={sync} disabled={pending} className="gap-2">
        <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
        {pending ? "Syncing…" : "Sync from sheet"}
      </Button>
    </div>
  );
}
