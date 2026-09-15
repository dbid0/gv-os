"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { BUSINESS_TIME_ZONE, VIEWER_TZ_COOKIE } from "@/lib/time/zone";

const ViewerTimeZone = createContext<string>(BUSINESS_TIME_ZONE);

/** The viewer's timezone for client components (the server passes it down). */
export function useViewerTimeZone(): string {
  return useContext(ViewerTimeZone);
}

/**
 * Provides the server's idea of the viewer's timezone and keeps it true: if
 * the browser's own zone differs (first visit, travel, a laptop that moved),
 * it records the zone in a cookie and re-renders the page so every counter
 * is recomputed on the viewer's calendar.
 */
export function ViewerTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    let browser: string | undefined;
    try {
      browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!browser || browser === timeZone) return;
    document.cookie = `${VIEWER_TZ_COOKIE}=${encodeURIComponent(browser)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [timeZone, router]);
  return <ViewerTimeZone.Provider value={timeZone}>{children}</ViewerTimeZone.Provider>;
}
