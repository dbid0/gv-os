"use client";

import { useSyncExternalStore } from "react";

/**
 * The evergreen CST clock (v2 spec): day + 12-hour time, ticking live.
 * useSyncExternalStore with a null server snapshot — the server can't know
 * the client's "now", and a mismatched first paint is how dead-click bugs
 * are born. The string snapshot only changes once a second, so that's the
 * re-render cadence.
 */

const fmt = (d: Date) =>
  d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });

function subscribe(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}

export function TopClock() {
  const label = useSyncExternalStore(
    subscribe,
    () => fmt(new Date()),
    () => null,
  );

  if (!label) return <span className="hidden w-44 md:block" aria-hidden />;
  return (
    <span className="text-muted-foreground hidden text-xs tabular-nums md:block">
      {label} <span className="text-faint">CST</span>
    </span>
  );
}
