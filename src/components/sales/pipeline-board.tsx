"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { addProspect, setProspectStage } from "@/app/(app)/sales/pipeline/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { PIPELINE_STAGES, monthlyRevShareCents } from "@/lib/pipeline/forecast";

export interface ProspectRow {
  id: string;
  name: string;
  handle: string | null;
  niche: string | null;
  followers: number | null;
  stage: string;
  setupFeeCents: number;
  revShareBps: number;
  estMonthlyRevCents: number;
}

const usd = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(c / 100);

const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  contacted: "Contacted",
  call_booked: "Call booked",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

const selectClass =
  "border-input bg-transparent h-8 rounded-md border px-2 text-xs shadow-xs outline-none";

export function PipelineBoard({ prospects }: { prospects: ProspectRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: "",
    handle: "",
    niche: "",
    followers: "",
    setupFeeDollars: "",
    revSharePct: "",
    estMonthlyRevDollars: "",
  });

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast({ tone: "success", title: ok });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });

  return (
    <div className="space-y-6">
      <Panel title="Add a prospect">
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                addProspect(form).then(() =>
                  setForm({
                    name: "",
                    handle: "",
                    niche: "",
                    followers: "",
                    setupFeeDollars: "",
                    revSharePct: "",
                    estMonthlyRevDollars: "",
                  }),
                ),
              "Prospect added",
            );
          }}
        >
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="h-8 text-xs"
            required
          />
          <Input
            value={form.handle}
            onChange={(e) => setForm({ ...form, handle: e.target.value })}
            placeholder="@handle"
            className="h-8 text-xs"
          />
          <Input
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
            placeholder="Niche (trading, ecom…)"
            className="h-8 text-xs"
          />
          <Input
            value={form.followers}
            onChange={(e) => setForm({ ...form, followers: e.target.value })}
            placeholder="Followers"
            className="h-8 text-xs"
            inputMode="numeric"
          />
          <Input
            value={form.setupFeeDollars}
            onChange={(e) => setForm({ ...form, setupFeeDollars: e.target.value })}
            placeholder="Setup fee ($)"
            className="h-8 text-xs"
            inputMode="decimal"
          />
          <Input
            value={form.revSharePct}
            onChange={(e) => setForm({ ...form, revSharePct: e.target.value })}
            placeholder="Rev-share (%)"
            className="h-8 text-xs"
            inputMode="decimal"
          />
          <Input
            value={form.estMonthlyRevDollars}
            onChange={(e) => setForm({ ...form, estMonthlyRevDollars: e.target.value })}
            placeholder="Est. monthly rev ($)"
            className="h-8 text-xs"
            inputMode="decimal"
          />
          <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
            <Plus className="size-3.5" /> Add
          </Button>
        </form>
      </Panel>

      <Panel title="Prospects" padded={false}>
        {prospects.length === 0 ? (
          <p className="text-faint py-8 text-center text-sm">
            No prospects yet — add the first creator you&apos;re selling into.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">Prospect</th>
                  <th className="py-2 pr-3 font-medium">Niche</th>
                  <th className="py-2 pr-3 text-right font-medium">Followers</th>
                  <th className="py-2 pr-3 text-right font-medium">Setup</th>
                  <th className="py-2 pr-3 text-right font-medium">Rev-share</th>
                  <th className="py-2 pr-3 text-right font-medium">/mo to GV</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <span className="block font-medium">{p.name}</span>
                      {p.handle && (
                        <span className="text-muted-foreground block text-xs">
                          {p.handle}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {p.niche ?? "—"}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      {p.followers ? p.followers.toLocaleString("en-US") : "—"}
                    </td>
                    <td className="numeric py-2 pr-3 text-right tabular-nums">
                      {usd(p.setupFeeCents)}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                      {(p.revShareBps / 100).toFixed(0)}%
                    </td>
                    <td className="numeric py-2 pr-3 text-right font-medium tabular-nums">
                      {usd(monthlyRevShareCents(p))}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={p.stage}
                        disabled={pending}
                        aria-label={`Stage for ${p.name}`}
                        className={selectClass}
                        onChange={(e) =>
                          run(
                            () => setProspectStage({ id: p.id, stage: e.target.value }),
                            "Stage updated",
                          )
                        }
                      >
                        {PIPELINE_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
