"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Merge, Split } from "lucide-react";

import { mergeInboxAction, unmergeInboxAction } from "@/lib/tracking/identity-actions";
import type { MergeCandidate } from "@/lib/tracking/identity";

/**
 * Same person, other inboxes. Lists every inbox that is this person, unmerges
 * any of them, and merges another in — typed, or picked from people sharing
 * this person's phone or full name. Merging joins their payments, calls and
 * reports everywhere; unmerging undoes exactly one link.
 */
export function IdentityPanel({
  slug,
  inboxes,
  suggestions,
}: {
  slug: string;
  /** The canonical email first. */
  inboxes: string[];
  suggestions: MergeCandidate[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [canonical, ...aliases] = inboxes;

  const merge = (alias: string) =>
    startTransition(async () => {
      setError(null);
      const res = await mergeInboxAction(slug, canonical, alias);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setEmail("");
      router.refresh();
    });

  const unmerge = (alias: string) =>
    startTransition(async () => {
      setError(null);
      const res = await unmergeInboxAction(slug, alias);
      if (!res.ok) setError(res.reason);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        <li className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{canonical}</span>
          <span className="text-faint rounded-full border px-2 py-0.5 text-[10px]">
            primary
          </span>
        </li>
        {aliases.map((a) => (
          <li key={a} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{a}</span>
            <button
              type="button"
              onClick={() => unmerge(a)}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs hover:underline"
            >
              <Split className="size-3" /> Unmerge
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="another inbox this person uses"
          className="bg-secondary/60 text-foreground w-72 rounded-md border px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => merge(email)}
          disabled={pending || email.trim() === ""}
          className="hover:bg-secondary/70 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
        >
          <Merge className="size-3.5" />{" "}
          {pending ? "Working…" : "Merge into this person"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-faint text-[11px]">Possibly the same person</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.email}
                type="button"
                onClick={() => merge(s.email)}
                disabled={pending}
                className="hover:bg-secondary/70 rounded-full border px-2.5 py-1 text-xs"
                title="Merge into this person"
              >
                {s.email}{" "}
                <span className="text-faint">
                  ·{" "}
                  {s.sharedPhone && s.sharedName
                    ? "same phone and name"
                    : s.sharedPhone
                      ? "same phone"
                      : "same name"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-warning text-xs">{error}</p>}
      <p className="text-faint text-xs">
        Merging joins this inbox&apos;s payments, calls and reports into this person
        everywhere: leads, the pipeline, students and the cash mix count them once.
        Unmerge to undo it.
      </p>
    </div>
  );
}
