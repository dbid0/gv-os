"use client";

import { useSyncExternalStore } from "react";
import { useViewerTimeZone } from "@/components/shell/time-zone";
import { zoneAbbreviation } from "@/lib/time/zone";

/**
 * The live clock (v2 spec): day + 12-hour time in the viewer's own timezone.
 * useSyncExternalStore with a null server snapshot — the server can't know
 * the client's "now", and a mismatched first paint is how dead-click bugs
 * are born. The string snapshot only changes once a second, so that's the
 * re-render cadence.
 */

const fmt = (d: Date, timeZone: string) =>
  d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  });

function subscribe(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}

export function TopClock() {
  const timeZone = useViewerTimeZone();
  const label = useSyncExternalStore(
    subscribe,
    () => fmt(new Date(), timeZone),
    () => null,
  );

  if (!label) return <span className="hidden w-44 md:block" aria-hidden />;
  return (
    <span className="text-muted-foreground hidden text-xs tabular-nums md:block">
      {label}{" "}
      <span className="text-faint">{zoneAbbreviation(new Date(), timeZone)}</span>
    </span>
  );
}
