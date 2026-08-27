"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteMeeting } from "@/app/(app)/team/meetings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function DeleteMeetingButton({
  id,
  mode = "detail",
  redirectTo,
}: {
  id: string;
  /** "detail" = labeled button (navigates away after); "row" = compact icon. */
  mode?: "detail" | "row";
  redirectTo?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);

  function run() {
    start(async () => {
      try {
        await deleteMeeting(id);
        toast({ tone: "success", title: "Call deleted" });
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Couldn't delete.",
        });
      }
    });
  }

  if (mode === "row") {
    return (
      <button
        type="button"
        disabled={pending}
        title={armed ? "Click again to confirm" : "Delete this call"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (armed) run();
          else {
            setArmed(true);
            setTimeout(() => setArmed(false), 3000);
          }
        }}
        className={cn(
          "shrink-0 rounded-md p-1.5 transition-colors",
          armed
            ? "text-destructive bg-destructive/10"
            : "text-faint hover:text-destructive hover:bg-destructive/10",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return armed ? (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Delete this call?</span>
      <Button variant="destructive" size="sm" disabled={pending} onClick={run}>
        Delete
      </Button>
      <Button variant="outline" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </div>
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="text-muted-foreground hover:text-destructive gap-2"
      onClick={() => setArmed(true)}
    >
      <Trash2 className="size-3.5" /> Delete
    </Button>
  );
}
