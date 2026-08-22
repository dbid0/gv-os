"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The deal-closed slide-in (v2 §5): every new income row gets a green toast
 * top-right; confetti bursts only above the offer's threshold. Watermarked
 * in localStorage so history never replays and each machine only celebrates
 * what happened while it was watching.
 */

interface DealFeedItem {
  id: string;
  recordedAt: string;
  label: string;
  dealType: string | null;
  cashCents: number;
  clientId: string | null;
}

interface Feed {
  deals: DealFeedItem[];
  thresholds: Record<string, number>;
  defaultThresholdCents: number;
}

const WATERMARK_KEY = "gv-deal-watermark";
const POLL_MS = 30_000;
const SHOW_MS = 4_000;

const fmtUsd = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(c / 100);

interface ActiveToast extends DealFeedItem {
  confetti: boolean;
}

export function DealClosedToasts() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/deals/latest", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const feed = (await res.json()) as Feed;
        if (feed.deals.length === 0) return;
        const newest = feed.deals[0].recordedAt;
        const watermark = localStorage.getItem(WATERMARK_KEY);
        localStorage.setItem(WATERMARK_KEY, newest);
        // First run on this machine: set the watermark silently.
        if (!watermark) return;
        const fresh = feed.deals.filter((d) => d.recordedAt > watermark).reverse();
        for (const deal of fresh) {
          const threshold =
            (deal.clientId ? feed.thresholds[deal.clientId] : undefined) ??
            feed.defaultThresholdCents;
          const toast: ActiveToast = {
            ...deal,
            confetti: deal.cashCents >= threshold,
          };
          setToasts((t) => [...t, toast]);
          setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== toast.id));
          }, SHOW_MS);
        }
      } catch {
        // A failed poll is silence, never an error surface.
      }
    };

    void poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-16 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-in slide-in-from-right pointer-events-auto relative overflow-hidden rounded-lg border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 p-3 shadow-lg backdrop-blur"
        >
          {t.confetti && <ConfettiBurst />}
          <p className="text-success text-sm font-semibold">
            💰 {fmtUsd(t.cashCents)} — {t.label}
          </p>
          <p className="text-muted-foreground text-xs">
            {t.dealType ?? "Deal"} closed ·{" "}
            <Link href="/accounting/transactions" className="underline">
              Click here for details
            </Link>
          </p>
        </div>
      ))}
    </div>
  );
}

/** A pure-CSS confetti burst — no library, ~1s of joy. */
function ConfettiBurst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="gv-confetti absolute size-1.5 rounded-sm"
          style={{
            left: `${(i * 7.3) % 100}%`,
            background: ["#2f8ce8", "#22c55e", "#eab308", "#bd68b8"][i % 4],
            animationDelay: `${(i % 5) * 60}ms`,
          }}
        />
      ))}
    </span>
  );
}
