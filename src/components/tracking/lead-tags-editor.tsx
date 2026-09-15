"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Plus, X } from "lucide-react";

import {
  addLeadTagAction,
  removeLeadTagAction,
} from "@/app/w/[slug]/leads/lead-tag-actions";

/**
 * A person's team tags: each one links to the Leads list filtered to it, comes
 * off with its ×, and a new one is typed or picked from the tags this offer
 * already uses (so "hot" stays "hot", not "Hot" and "hot-lead").
 */
export function LeadTagsEditor({
  slug,
  email,
  tags,
  knownTags,
}: {
  slug: string;
  email: string;
  tags: string[];
  knownTags: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const res = await addLeadTagAction(slug, email, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setValue("");
      router.refresh();
    });
  };

  const remove = (tag: string) =>
    startTransition(async () => {
      setError(null);
      const res = await removeLeadTagAction(slug, email, tag);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  const suggestions = knownTags.filter((t) => !tags.includes(t));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && <span className="text-faint text-xs">No tags yet.</span>}
        {tags.map((t) => (
          <span
            key={t}
            className="bg-secondary/60 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
          >
            <Link href={`/w/${slug}/leads?tag=${t}`} className="hover:text-brand">
              {t}
            </Link>
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={pending}
              aria-label={`Remove tag ${t}`}
              className="text-faint hover:text-foreground rounded-full p-0.5"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form onSubmit={add} className="inline-flex items-center gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            list="lead-tag-options"
            placeholder="add a tag"
            aria-label="Add a tag"
            maxLength={40}
            className="bg-card h-7 w-32 rounded-full border px-2.5 text-xs"
          />
          <datalist id="lead-tag-options">
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={pending || value.trim() === ""}
            aria-label="Add tag"
            className="hover:bg-secondary/70 rounded-full border p-1 disabled:opacity-50"
          >
            <Plus className="size-3" />
          </button>
        </form>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
