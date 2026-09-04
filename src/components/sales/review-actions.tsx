"use client";

import { useTransition } from "react";
import { Check, Undo2 } from "lucide-react";

import {
  markCallReviewed,
  reopenCallReview,
} from "@/app/(app)/sales/call-reviews/actions";
import { Button } from "@/components/ui/button";

/**
 * Clear a call from the manager's inbox, or put it back.
 *
 * The row stays on screen until the page revalidates, so the manager sees what
 * they just cleared rather than having it vanish mid-read.
 */
export function ReviewActions({
  recordingId,
  reviewed,
}: {
  recordingId: string;
  reviewed: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant={reviewed ? "ghost" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (reviewed) await reopenCallReview(recordingId);
          else await markCallReviewed(recordingId);
        })
      }
      className="shrink-0 gap-1.5"
    >
      {reviewed ? (
        <>
          <Undo2 className="size-3.5" /> Reopen
        </>
      ) : (
        <>
          <Check className="size-3.5" /> Reviewed
        </>
      )}
    </Button>
  );
}
