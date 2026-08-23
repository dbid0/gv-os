"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import {
  confirmPaymentEvent,
  dismissPaymentEvent,
} from "@/app/(app)/accounting/payments/actions";
import { cn } from "@/lib/utils";

/**
 * The confirm step on one captured event (punch-list 15). Confirm appends
 * the backlog row; Dismiss parks it. The row greys instantly and the server
 * result settles it — an error puts it back with a toast.
 */
export function ConfirmQueueCell({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [settled, setSettled] = useState<"posted" | "ignored" | null>(null);

  const act = (verb: "confirm" | "dismiss") => {
    startTransition(async () => {
      const run = verb === "confirm" ? confirmPaymentEvent : dismissPaymentEvent;
      try {
        const result = await run(eventId);
        if (result.ok) {
          setSettled(verb === "confirm" ? "posted" : "ignored");
          toast({
            tone: "success",
            title:
              verb === "confirm"
                ? "Posted — backlog row appended"
                : "Dismissed — nothing posted",
          });
        } else {
          toast({ tone: "error", title: result.error });
        }
      } catch {
        toast({ tone: "error", title: "Something failed — the event is untouched." });
      }
    });
  };

  if (settled) {
    return <span className="text-faint text-xs capitalize">{settled}</span>;
  }

  return (
    <span
      className={cn("inline-flex gap-1.5", pending && "pointer-events-none opacity-50")}
    >
      <button
        type="button"
        onClick={() => act("confirm")}
        className="border-brand/40 text-brand hover:bg-brand-soft/50 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
      >
        <Check className="size-3" /> Confirm
      </button>
      <button
        type="button"
        onClick={() => act("dismiss")}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
      >
        <X className="size-3" /> Dismiss
      </button>
    </span>
  );
}
