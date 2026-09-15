import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The Numbers page's building blocks: a titled section of tiles, each tile a
 * figure with the denominator it was measured over written beneath it — the
 * house rule that no rate appears without saying "of what".
 */

export const pctOf = (v: number | null): string =>
  v === null ? "—" : `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;

export const countOf = (v: number | null): string =>
  v === null ? "—" : v.toLocaleString("en-US");

export const usdOf = (cents: number | null): string =>
  cents === null
    ? "—"
    : (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Math.abs(cents) >= 10_000_000 ? 0 : 2,
      });

export function NumberSection({
  title,
  lede,
  children,
  footnote,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {lede && <p className="text-muted-foreground mt-0.5 text-xs">{lede}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
      {footnote && <p className="text-faint text-xs">{footnote}</p>}
    </section>
  );
}

export function NumberTile({
  label,
  value,
  sub,
  tone = "default",
  title,
}: {
  label: string;
  value: string;
  /** The denominator or source, in words. */
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  /** Hover text: the exact definition. */
  title?: string;
}) {
  const tones = {
    default: "",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    brand: "text-brand",
  } as const;
  return (
    <div className="card-grad min-w-0 rounded-xl border p-3.5" title={title}>
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          "numeric mt-1.5 text-xl leading-none font-semibold tabular-nums",
          value === "—" ? "text-faint" : tones[tone],
        )}
      >
        {value}
      </p>
      {sub && <p className="text-faint mt-1.5 truncate text-[11px]">{sub}</p>}
    </div>
  );
}

/** One stacked bar of parts, labelled beneath; parts with 0 draw nothing. */
export function PartsBar({
  parts,
  empty,
}: {
  parts: { label: string; value: number; className: string }[];
  empty: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <p className="text-faint text-xs">{empty}</p>;
  return (
    <div className="space-y-2">
      <div className="bg-secondary flex h-2.5 overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.label}
              className={p.className}
              style={{ width: `${(p.value / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.className)} />
            {p.label}{" "}
            <span className="text-foreground tabular-nums">
              {p.value.toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
