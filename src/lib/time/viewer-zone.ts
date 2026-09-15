import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
  BUSINESS_TIME_ZONE,
  VIEWER_TZ_COOKIE,
  normalizeTimeZone,
} from "@/lib/time/zone";

/**
 * The timezone of the person viewing this request, as their browser reported
 * it (see TimeZoneSync). Falls back to the business zone before the first
 * report. Cached per request.
 */
export const viewerTimeZone = cache(async (): Promise<string> => {
  try {
    const store = await cookies();
    return normalizeTimeZone(store.get(VIEWER_TZ_COOKIE)?.value) ?? BUSINESS_TIME_ZONE;
  } catch {
    return BUSINESS_TIME_ZONE;
  }
});
