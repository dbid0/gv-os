"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";

import { decideColumnMapping } from "@/app/w/[slug]/tracking/actions";
import { Button } from "@/components/ui/button";

export interface ProposedColumn {
  id: string;
  tab: string;
  header: string;
  field: string;
  reason: string | null;
  approved: boolean;
}

/**
 * Column meanings a model proposed, waiting on a person.
 *
 * A proposal is a claim about WORDING — "on this sheet, the column headed
 * 'Money In Today' means cash collected" — which is checkable at a glance and
 * cannot invent a value. Until it is approved the sync ignores it completely,
 * so the worst a wrong proposal costs is one click.
 */
export function ColumnProposals({
  slug,
  proposals,
}: {
  slug: string;
  proposals: ProposedColumn[];
}) {
  const [pending, start] = useTransition();
  if (proposals.length === 0) return null;

  const waiting = proposals.filter((p) => !p.approved);
  const live = proposals.filter((p) => p.approved);

  return (
    <div className="space-y-3">
      {waiting.map((p) => (
        <div
          key={p.id}
          className="flex items-start justify-between gap-4 border-b pb-3"
        >
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{p.header}</span>
              <span className="text-faint"> on {p.tab} means </span>
              <span className="font-medium">{p.field}</span>
            </p>
            {p.reason && (
              <p className="text-muted-foreground mt-0.5 text-xs">{p.reason}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(() => decideColumnMapping(slug, p.id, true).then(() => {}))
              }
              className="gap-1.5"
            >
              <Check className="size-3.5" /> Use it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(() => decideColumnMapping(slug, p.id, false).then(() => {}))
              }
              className="gap-1.5"
            >
              <X className="size-3.5" /> No
            </Button>
          </div>
        </div>
      ))}

      {live.length > 0 && (
        <p className="text-faint text-xs">
          In use: {live.map((p) => `${p.header} → ${p.field}`).join(" · ")}
        </p>
      )}
      <p className="text-faint text-xs">
        A proposal is about what a column MEANS, never about what a cell says. Nothing
        counts until it is approved, and a missing value is never filled in.
      </p>
    </div>
  );
}
