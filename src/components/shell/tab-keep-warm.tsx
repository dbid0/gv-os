"use client";

import { useEffect } from "react";

/**
 * While a tab has the app open, the app keeps its own backend warm.
 *
 * The external keep-warm pinger (GitHub cron) is throttled to roughly hourly
 * by the platform, so a tab left open long enough comes back to a cold
 * function + cold DB pool — the "sat idle, first click drags" complaint.
 * This heartbeat pings /api/health (a select 1, ~60ms) every 4 minutes while
 * the tab lives, and fires immediately the moment the tab regains visibility,
 * so by the time a human finds the thing they want to click, the backend is
 * already awake. Renders nothing.
 */

const HEARTBEAT_MS = 4 * 60 * 1000;

export function TabKeepWarm() {
  useEffect(() => {
    const ping = () => {
      void fetch("/api/health", { cache: "no-store" }).catch(() => {
        // Warmth is best-effort; a failed ping must never surface.
      });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
