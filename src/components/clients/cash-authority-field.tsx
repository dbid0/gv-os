"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Banknote, CheckCircle2, Sheet } from "lucide-react";

import { saveCashAuthority } from "@/app/(app)/clients/[slug]/actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * The Money Spine cash-authority switch for one offer (spec §3). Decides which
 * source owns this offer's CASH so a deal is never counted twice. Multiple
 * processors always pool their cash regardless — this only controls whether the
 * new-deal form ALSO contributes cash.
 */

type Authority = "auto" | "forms" | "processors";

const OPTIONS: { value: Authority; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "Processors own the cash once connected, else the form",
  },
  { value: "forms", label: "Form", hint: "The new-deal form is the cash source" },
  {
    value: "processors",
    label: "Processors",
    hint: "Only the connected processors report cash",
  },
];

export function CashAuthorityField({
  slug,
  value,
  connectedProcessors,
}: {
  slug: string;
  value: string;
  connectedProcessors: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const current = (["auto", "forms", "processors"] as string[]).includes(value)
    ? (value as Authority)
    : "auto";

  const resolved =
    current === "forms"
      ? "form"
      : current === "processors"
        ? "processors"
        : connectedProcessors.length > 0
          ? "processors"
          : "form";

  const pick = (next: Authority) => {
    if (next === current || pending) return;
    start(async () => {
      try {
        await saveCashAuthority(slug, next);
        toast({ tone: "success", title: `Cash authority set to ${next}` });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not save.",
        });
      }
    });
  };

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-9 shrink-0 place-items-center rounded-lg border">
        <Banknote className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Cash authority</p>
        <p className="text-faint text-xs">
          Which source owns this offer&apos;s cash, so a deal is never counted twice.
          Multiple processors always pool — this only decides if the form also adds
          cash.
        </p>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="bg-secondary/60 inline-flex rounded-lg border p-0.5 text-xs">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.hint}
              onClick={() => pick(o.value)}
              disabled={pending}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                current === o.value
                  ? "bg-card text-foreground border-border-strong border font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-faint flex items-center gap-1 text-[11px]">
          <CheckCircle2 className="text-success size-3" />
          {resolved === "processors" ? (
            <>
              Processors own the cash
              {connectedProcessors.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({connectedProcessors.join(", ")})
                </span>
              )}
            </>
          ) : (
            <>
              <Sheet className="size-3" /> The form owns the cash
            </>
          )}
        </span>
      </div>
    </div>
  );
}
