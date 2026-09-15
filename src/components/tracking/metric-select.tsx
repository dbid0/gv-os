"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartPie } from "lucide-react";

import { ATTRIBUTION_METRICS } from "@/lib/tracking/attribution-slices";

/**
 * Which metric the attribution donut splits. Choosing navigates, keeping the
 * dimension and the window — the whole filter row stays where it was.
 */
export function MetricSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="bg-secondary/40 text-muted-foreground flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1 text-xs">
      <ChartPie className="size-3.5" aria-hidden />
      <span className="sr-only">Split by metric</span>
      <select
        className="text-foreground bg-transparent py-0.5 text-xs outline-none"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("metric", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {ATTRIBUTION_METRICS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
