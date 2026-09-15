"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Bookmark, X } from "lucide-react";

import {
  deleteLeadViewAction,
  saveLeadViewAction,
} from "@/app/w/[slug]/leads/lead-tag-actions";
import { cn } from "@/lib/utils";

/**
 * Saved views on the Leads list: one click reopens a named filter set for the
 * whole offer's team. The filters showing now can be saved under a name,
 * unless an existing view already holds exactly these filters.
 */
export function LeadViewsBar({
  slug,
  views,
  currentQuery,
}: {
  slug: string;
  views: { id: string; name: string; query: string }[];
  /** The normalized query string of the filters on screen; "" for none. */
  currentQuery: string;
}) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const alreadySaved = views.some((v) => v.query === currentQuery);

  const save = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const res = await saveLeadViewAction(slug, name, currentQuery);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setNaming(false);
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      setError(null);
      const res = await deleteLeadViewAction(slug, id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  if (views.length === 0 && currentQuery === "") return null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-faint mr-1 inline-flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase">
          <Bookmark className="size-3" /> Views
        </span>
        {views.map((v) => (
          <span
            key={v.id}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs",
              v.query === currentQuery
                ? "border-brand/50 bg-brand-soft/30 text-foreground"
                : "text-muted-foreground",
            )}
          >
            <Link
              href={`/w/${slug}/leads?${v.query}`}
              className="hover:text-foreground"
            >
              {v.name}
            </Link>
            <button
              type="button"
              onClick={() => remove(v.id)}
              disabled={pending}
              aria-label={`Delete view ${v.name}`}
              className="text-faint hover:text-foreground rounded-full p-0.5"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {currentQuery !== "" &&
          !alreadySaved &&
          (naming ? (
            <form onSubmit={save} className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="name this view"
                aria-label="View name"
                maxLength={40}
                className="bg-card h-7 w-40 rounded-full border px-2.5 text-xs"
              />
              <button
                type="submit"
                disabled={pending || name.trim() === ""}
                className="hover:bg-secondary/70 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="text-faint hover:text-foreground px-1 text-xs"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="text-brand px-1 text-xs hover:underline"
            >
              + Save these filters as a view
            </button>
          ))}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
