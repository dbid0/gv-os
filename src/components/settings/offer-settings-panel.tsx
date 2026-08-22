"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveOfferSettings } from "@/app/(app)/settings/offer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

export interface OfferSettingsRow {
  clientId: string;
  clientName: string;
  eodAlertTime: string | null;
  bodAlertTime: string | null;
  confettiThresholdCents: number;
}

function Row({ row }: { row: OfferSettingsRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [eod, setEod] = useState(row.eodAlertTime ?? "");
  const [bod, setBod] = useState(row.bodAlertTime ?? "12:00");
  const [confetti, setConfetti] = useState(
    String(Math.round(row.confettiThresholdCents / 100)),
  );

  return (
    <form
      className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveOfferSettings({
              clientId: row.clientId,
              eodAlertTime: eod || null,
              bodAlertTime: bod || null,
              confettiThresholdDollars: confetti,
            });
            toast({ tone: "success", title: `${row.clientName} settings saved` });
            router.refresh();
          } catch (err) {
            toast({
              tone: "error",
              title: err instanceof Error ? err.message : "Save failed.",
            });
          }
        });
      }}
    >
      <span className="min-w-32 flex-1 text-sm font-medium">{row.clientName}</span>
      <label className="text-faint flex flex-col gap-1 text-[11px]">
        EOD alert (CT)
        <Input
          type="time"
          value={eod}
          onChange={(e) => setEod(e.target.value)}
          className="h-8 w-28 text-xs"
        />
      </label>
      <label className="text-faint flex flex-col gap-1 text-[11px]">
        BOD alert (CT)
        <Input
          type="time"
          value={bod}
          onChange={(e) => setBod(e.target.value)}
          className="h-8 w-28 text-xs"
        />
      </label>
      <label className="text-faint flex flex-col gap-1 text-[11px]">
        Confetti above ($)
        <Input
          value={confetti}
          onChange={(e) => setConfetti(e.target.value)}
          inputMode="numeric"
          className="h-8 w-28 text-xs"
        />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function OfferSettingsPanel({ rows }: { rows: OfferSettingsRow[] }) {
  return (
    <Panel title="Per-offer alerts & celebrations">
      <p className="text-faint mb-3 text-sm">
        EOD/BOD alert times feed the notification engine (misses fire once their report
        sources connect). The confetti threshold decides which closes get the full
        celebration — every close still gets the slide-in.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <Row key={r.clientId} row={r} />
        ))}
      </div>
    </Panel>
  );
}
