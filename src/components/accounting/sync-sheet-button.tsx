"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { syncFinanceSheet } from "@/app/(app)/accounting/reconciliation/actions";
import { Button } from "@/components/ui/button";

export function SyncSheetButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function sync() {
    setError(null);
    start(async () => {
      try {
        await syncFinanceSheet();
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
