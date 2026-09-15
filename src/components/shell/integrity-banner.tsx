"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldAlert } from "lucide-react";

import { markNotificationsRead } from "@/app/(app)/notifications/actions";
import type { IntegrityBannerModel } from "@/lib/notifications/integrity";
import { cn } from "@/lib/utils";

/**
 * The owner-facing money alarm: unreviewed reconciliation alerts, shown under
 * the top bar on every page until someone opens the reconciliation and marks
 * them reviewed. It never claims the books are wrong right now — only that an
 * alert is waiting for a human.
 */
export function IntegrityBanner({ model }: { model: IntegrityBannerModel }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  const review = () =>
    startTransition(async () => {
      await markNotificationsRead(model.ids);
      setHidden(true);
      router.refresh();
    });

  const critical = model.severity === "critical";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm md:px-6",
        critical
          ? "border-destructive/40 bg-destructive/10"
          : "border-warning/40 bg-warning/10",
      )}
    >
      <ShieldAlert
        className={cn(
          "size-4 shrink-0",
          critical ? "text-destructive" : "text-warning",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{model.headline}</p>
        <p className="text-muted-foreground truncate text-xs">
          {model.lines.join(" · ")}
          {model.count > model.lines.length &&
            ` · and ${model.count - model.lines.length} more`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/accounting/reconciliation"
          className="bg-background/60 hover:bg-background rounded-md border px-2.5 py-1 text-xs font-medium"
        >
          Open reconciliation
        </Link>
        <button
          type="button"
          onClick={review}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground px-1 text-xs hover:underline"
        >
          {pending ? "Marking…" : "Mark reviewed"}
        </button>
      </div>
    </div>
  );
}
