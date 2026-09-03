"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { syncTrackingSheet } from "@/app/w/[slug]/tracking/actions";
import { Button } from "@/components/ui/button";

/**
 * Pull the tracking sheet on demand.
 *
 * Reports what happened rather than silently refreshing: a sheet that isn't
 * shared with the agency Google account fails on the server, and the person
 * clicking needs to see that sentence, not an unchanged page.
 */
export function SyncTrackingButton({
  slug,
  label = "Sync now",
}: {
  slug: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {message && <span className="text-faint text-xs">{message}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const res = await syncTrackingSheet(slug);
            setMessage(
              res.error ?? `pulled ${res.rowCount?.toLocaleString("en-US") ?? 0} rows`,
            );
          })
        }
        className="gap-2"
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Syncing…" : label}
      </Button>
    </span>
  );
}
