import "server-only";

import { loadCallLog } from "@/lib/calls/call-log-loader";
import { callScoreboard, type CallScoreboard } from "@/lib/calls/call-scoreboard";
import { loadDialing, type DialingData } from "@/lib/crm/dialing-loader";
import {
  loadApplicationNumbers,
  type ApplicationNumbersData,
} from "@/lib/tracking/application-numbers-loader";
import {
  loadCashCatalog,
  type CashCatalogData,
} from "@/lib/tracking/cash-catalog-loader";
import { reportBounds, type ReportRange } from "@/lib/tracking/report-window";
import { dayKeyIn } from "@/lib/time/zone";
import type { RangeBounds } from "@/lib/transactions/homepage";

export type OfferNumbers = {
  bounds: RangeBounds;
  /** Every booking the offer has, counted or not ("has a calendar at all"). */
  totalBookings: number;
  calls: CallScoreboard;
  cash: CashCatalogData;
  applications: ApplicationNumbersData;
  dialing: DialingData;
};

/**
 * Every number an offer has, in one window — the ONE door the Numbers page and
 * the MCP server both read through, so the page and an assistant can never
 * describe the same offer differently.
 */
export async function loadOfferNumbers(
  clientId: string,
  countedCallSources: string[] | null,
  range: ReportRange,
  timeZone: string,
  now: Date = new Date(),
): Promise<OfferNumbers> {
  const todayKey = dayKeyIn(now, timeZone);
  const bounds = reportBounds(range, todayKey);
  const [{ log, totalBookings }, dialing, cash] = await Promise.all([
    loadCallLog(clientId, countedCallSources, now),
    loadDialing(clientId, bounds, timeZone),
    loadCashCatalog(clientId, bounds, todayKey, timeZone),
  ]);
  const applications = await loadApplicationNumbers(clientId, log, bounds, timeZone);
  return {
    bounds,
    totalBookings,
    calls: callScoreboard(log, bounds, timeZone),
    cash,
    applications,
    dialing,
  };
}
