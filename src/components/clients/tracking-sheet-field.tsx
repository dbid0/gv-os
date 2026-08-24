"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, DownloadCloud, Sheet } from "lucide-react";

import {
  importOfferDeals,
  saveTrackingSheet,
} from "@/app/(app)/clients/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * The new-deal-form feed: point this offer at its tracking sheet. The importer
 * reads the sheet's `🤝 New Deals` tab. Saving only stores the id — nothing
 * pulls until the import is run.
 */
export function TrackingSheetField({
  slug,
  sheetId,
}: {
  slug: string;
  sheetId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState(sheetId ?? "");
  const [pending, start] = useTransition();
  const [importing, startImport] = useTransition();

  const save = () =>
    start(async () => {
      try {
        await saveTrackingSheet(slug, value);
        toast({
          tone: "success",
          title: value.trim() ? "Tracking sheet connected" : "Tracking sheet cleared",
        });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not save.",
        });
      }
    });

  const runImport = () =>
    startImport(async () => {
      try {
        const r = await importOfferDeals(slug);
        const detail =
          `${r.inserted} new · ${r.skipped} already in` +
          (r.refused.length ? ` · ${r.refused.length} skipped` : "");
        toast({ tone: "success", title: `Imported ${r.read} deal rows`, detail });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Import failed.",
        });
      }
    });

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-9 shrink-0 place-items-center rounded-lg border">
        <Sheet className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">New-deal forms</p>
        <p className="text-faint text-xs">
          Google Sheet id (the part after <span className="font-mono">/d/</span> in the
          sheet URL). Its <span className="font-mono">🤝 New Deals</span> tab feeds the
          importer.
        </p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="1rC3yHTz…"
        className="w-full font-mono text-xs sm:w-72"
      />
      <Button onClick={save} disabled={pending} className="gap-1.5">
        <Check className="size-3.5" /> {sheetId ? "Update" : "Connect"}
      </Button>
      {sheetId && (
        <Button
          variant="outline"
          onClick={runImport}
          disabled={importing}
          className="gap-1.5"
        >
          <DownloadCloud className="size-3.5" />
          {importing ? "Importing…" : "Import deals"}
        </Button>
      )}
    </div>
  );
}
