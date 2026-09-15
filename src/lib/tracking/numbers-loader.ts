import "server-only";

import { loadCallLog } from "@/lib/calls/call-log-loader";
import { callScoreboard, type CallScoreboard } from "@/lib/calls/call-scoreboard";
import {
  filterLogByPerson,
  personOptions,
  readPersonFilter,
  type PersonFilter,
  type PersonOptions,
} from "@/lib/calls/person-filter";
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
  /** The person the call + dialing numbers are cut to; null = the whole offer. */
  person: PersonFilter | null;
  /** Every closer and setter the offer's reports name, for the filter row. */
  personOptions: PersonOptions;
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
  /** `?who=closer:Name` / `setter:Name`, validated against the offer's names. */
  who?: unknown,
): Promise<OfferNumbers> {
  const todayKey = dayKeyIn(now, timeZone);
  const bounds = reportBounds(range, todayKey);
  // Three small bursts, never one big one. The db pool's law: when in-flight
  // queries outrun the pool, postgres-js pipelines the overflow and the
  // transaction pooler never answers, so the page hangs instead of slowing.
  // Peak per burst: call log 5 · cash catalog 5 + dialing 2 = 7 · applications 4.
  const { log, totalBookings } = await loadCallLog(clientId, countedCallSources, now);
  const options = personOptions(log);
  const person = readPersonFilter(who, options);
  const [cash, dialing] = await Promise.all([
    loadCashCatalog(clientId, bounds, todayKey, timeZone),
    loadDialing(clientId, bounds, timeZone, person?.name ?? null),
  ]);
  // Applications aren't anyone's, so they always read the whole offer.
  const applications = await loadApplicationNumbers(clientId, log, bounds, timeZone);
  const calls = person ? filterLogByPerson(log, person) : log;
  return {
    bounds,
    person,
    personOptions: options,
    totalBookings,
    calls: callScoreboard(calls, bounds, timeZone),
    cash,
    applications,
    dialing,
  };
}
