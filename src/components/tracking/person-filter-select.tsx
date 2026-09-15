"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserRound } from "lucide-react";

import type { PersonOptions } from "@/lib/calls/person-filter";

/**
 * The Numbers page's person filter: one select, closers and setters grouped.
 * Choosing navigates (keeping the window); "Everyone" clears it.
 */
export function PersonFilterSelect({
  options,
  value,
}: {
  options: PersonOptions;
  /** The current `who` value ("closer:Name"), or "" for everyone. */
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (options.closers.length === 0 && options.setters.length === 0) return null;

  return (
    <label className="bg-secondary/40 text-muted-foreground flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1 text-xs">
      <UserRound className="size-3.5" aria-hidden />
      <span className="sr-only">Cut to a person</span>
      <select
        className="text-foreground bg-transparent py-0.5 text-xs outline-none"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set("who", e.target.value);
          else next.delete("who");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        <option value="">Everyone</option>
        {options.closers.length > 0 && (
          <optgroup label="Closers">
            {options.closers.map((n) => (
              <option key={`closer:${n}`} value={`closer:${n}`}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
        {options.setters.length > 0 && (
          <optgroup label="Setters">
            {options.setters.map((n) => (
              <option key={`setter:${n}`} value={`setter:${n}`}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
