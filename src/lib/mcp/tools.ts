import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { appEocLeadRows } from "@/lib/calls/eoc-store";
import { loadCallLog } from "@/lib/calls/call-log-loader";
import { CALL_STATES, type CallState } from "@/lib/calls/call-log";
import {
  segmentByCloser,
  segmentBySetter,
  type CloserSegment,
} from "@/lib/calls/closer-segments";
import { getClientReport } from "@/lib/clients/report";
import { unreviewedIntegrityBanner } from "@/lib/notifications/count";
import { COHORTS } from "@/lib/students/board";
import { callUsage } from "@/lib/students/calls";
import { loadStudentsBoard } from "@/lib/students/loader";
import { resolveEmail } from "@/lib/tracking/aliases";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import { listLeadTags, listLeadViews } from "@/lib/tracking/lead-tags-store";
import {
  LEAD_HAS,
  describeFilters,
  filterLeads,
  readLeadFilters,
  tagUsage,
  tagsByLead,
  type LeadFilters,
} from "@/lib/tracking/lead-views";
import { loadOfferSales } from "@/lib/tracking/offer-metrics-loader";
import { currentSnapshot, leadByEmail, leadsForClient } from "@/lib/tracking/queries";
import { numbersForMcp } from "@/lib/mcp/numbers-shape";
import { ToolInputError, type ToolDefinition } from "@/lib/mcp/protocol";
import { loadOfferNumbers } from "@/lib/tracking/numbers-loader";
import { REPORT_RANGES, type ReportRange } from "@/lib/tracking/report-window";

/** Integer cents as "1234.50", or null for unknown — never a guessed zero. */
export const dollars = (cents: number | null | undefined): string | null =>
  cents === null || cents === undefined ? null : (cents / 100).toFixed(2);

const pct = (v: number | null): number | null => (v === null ? null : Math.round(v));

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

async function offerBySlug(slug: unknown) {
  const wanted = String(slug ?? "")
    .trim()
    .toLowerCase();
  const db = getDb();
  const [row] = await db
    .select({
      id: clients.id,
      slug: clients.slug,
      name: clients.name,
      status: clients.status,
      countedCallSources: clients.countedCallSources,
    })
    .from(clients)
    .where(eq(clients.slug, wanted))
    .limit(1);
  if (!row) {
    throw new ToolInputError(
      `No offer has the slug "${wanted}". Call list_offers to see every slug.`,
    );
  }
  return row;
}

const segment = (s: CloserSegment) => ({
  closer: s.closer,
  isAPerson: !s.unattributed,
  held: s.held,
  shows: s.shows,
  noShows: s.noShows,
  closes: s.closes,
  showRatePct: pct(s.showRate),
  closeRatePct: pct(s.closeRate),
});

const slugArg = {
  type: "string",
  description: 'The offer\'s slug from list_offers, e.g. "my-offer".',
};

/** The read-only toolset. Every tool reads through the same loaders the app pages use. */
export const GV_OS_TOOLS: ToolDefinition[] = [
  {
    name: "list_offers",
    description:
      "Every offer (client) in GV OS with its slug, name and status. Start here: the other tools take a slug.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const db = getDb();
      const rows = await db
        .select({ slug: clients.slug, name: clients.name, status: clients.status })
        .from(clients)
        .orderBy(clients.name);
      return { offers: rows };
    },
  },
  {
    name: "offer_snapshot",
    description:
      "One offer at a glance: all-time cash and deals from its tracking mirror, applications in the last 30 days, call counts by state, show and close rates split by confirmation, stuck calls, and students.",
    inputSchema: {
      type: "object",
      properties: { slug: slugArg },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const now = new Date();
      // Sequenced, not all at once: the sales loader alone bursts ~7 queries,
      // and the pool law keeps any one request's in-flight burst small.
      const sales = await loadOfferSales(offer.id, offer.slug, offer.name);
      const [calls, students] = await Promise.all([
        loadCallLog(offer.id, offer.countedCallSources ?? null, now),
        loadStudentsBoard(offer.id, now),
      ]);
      const report =
        sales.report ??
        (await getClientReport(offer.slug, offer.name).catch(() => null));
      const rates = sales.metrics.confirmation.rates;
      const group = (g: NonNullable<typeof rates>["confirmed"]) => ({
        held: g.held,
        reported: g.reported,
        showRatePct: pct(g.showRate),
        closeRatePct: pct(g.closeRate),
      });
      return {
        offer: { slug: offer.slug, name: offer.name, status: offer.status },
        asOf: now.toISOString(),
        trackingMirror: report
          ? {
              cashCollectedAllTime: dollars(report.mirror.cashCents),
              dealsAllTime: report.mirror.deals,
            }
          : null,
        applicationsLast30Days: sales.apps.length,
        calls: calls.totalBookings === 0 ? null : calls.counts,
        confirmation: {
          confirmedBeforeCall: sales.metrics.confirmation.everConfirmed,
          ofBookings: sales.metrics.confirmation.ofBookings,
          rates: rates
            ? {
                confirmed: group(rates.confirmed),
                notConfirmed: group(rates.unconfirmed),
                heldWithoutReport: rates.unreported,
              }
            : null,
        },
        stuckCalls: sales.metrics.stuck.length,
        students: students.source
          ? {
              total: students.summary.total,
              inFirstMonth: students.summary.firstMonth,
              refundedInFull: students.summary.refunded,
              paidNetOfRefundsAllTime: dollars(students.summary.netCents),
            }
          : null,
      };
    },
  },
  {
    name: "list_calls",
    description:
      "The offer's call log from its counted calendar: each booking's time, invitee, confirmation state, and outcome with where it was recorded (GV OS or the tracking sheet).",
    inputSchema: {
      type: "object",
      properties: {
        slug: slugArg,
        state: {
          type: "string",
          description: "Only calls in this state.",
          enum: CALL_STATES.map((s) => s.key),
        },
        limit: {
          type: "integer",
          description: "How many calls, 1 to 100 (default 25).",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const limit = args.limit === undefined ? 25 : Number(args.limit);
      if (limit < 1 || limit > 100) {
        throw new ToolInputError("limit must be between 1 and 100.");
      }
      const { log, counts } = await loadCallLog(
        offer.id,
        offer.countedCallSources ?? null,
        new Date(),
      );
      const state = args.state as CallState | undefined;
      const rows = (state ? log.filter((r) => r.state === state) : log).slice(0, limit);
      return {
        counts,
        calls: rows.map((r) => ({
          startsAt: iso(r.startsAt),
          invitee: r.inviteeName ?? r.inviteeEmail,
          email: r.inviteeEmail,
          state: r.state,
          rescheduled: r.rescheduled,
          confirmation: r.confirmation,
          outcome: r.outcome,
          outcomeWords: r.outcomeWords,
          recordedIn: r.reportSource === "app" ? "gv-os" : r.reportSource,
          closer: r.closer,
          movedTo: iso(r.movedTo),
          movedFrom: iso(r.movedFrom),
          cancelReason: r.cancelReason,
        })),
      };
    },
  },
  {
    name: "list_students",
    description:
      "Everyone who bought from the offer, with weeks since their first payment, cohort, payment count, what they paid net of refunds, and whether they were refunded in full.",
    inputSchema: {
      type: "object",
      properties: {
        slug: slugArg,
        cohort: {
          type: "string",
          description: "Only students in this cohort.",
          enum: COHORTS.map((c) => c.key),
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const data = await loadStudentsBoard(offer.id, new Date());
      if (!data.source) {
        return { students: [], note: "This offer has no payment feed yet." };
      }
      const cohort = args.cohort as string | undefined;
      return {
        summary: {
          total: data.summary.total,
          inFirstMonth: data.summary.firstMonth,
          refundedInFull: data.summary.refunded,
          paidNetOfRefundsAllTime: dollars(data.summary.netCents),
        },
        undatedPayers: data.board.undatedPayers,
        belowStudentMinimum: data.board.belowMinimumPayers,
        program: {
          minimumPayment: dollars(data.program.minPaymentCents),
          lengthWeeks: data.program.lengthWeeks,
          oneOnOneCallsPerStudent: data.callLimit,
        },
        students: data.board.students
          .filter((s) => !cohort || s.cohort === cohort)
          .map((s) => ({
            name: s.name,
            email: s.email,
            weeksIn: s.weeksIn,
            programWeeks: s.programWeeks,
            programComplete: s.programComplete,
            cohort: s.cohort,
            firstPaidAt: iso(s.firstPaidAt),
            startedAt: iso(s.startedAt),
            payments: s.payments,
            paidNet: dollars(s.netCents),
            refunded: s.refunded,
            oneOnOneCalls: (() => {
              const u = callUsage(
                s.email ? (data.calls[s.email] ?? 0) : 0,
                data.callLimit,
              );
              return { used: u.used, limit: u.limit, limitReached: u.reached };
            })(),
          })),
      };
    },
  },
  {
    name: "find_lead",
    description:
      "One person's whole journey on an offer by email — applications, booked calls, end-of-call reports (sheet or GV OS), deals and payments — with every inbox that is the same person merged.",
    inputSchema: {
      type: "object",
      properties: {
        slug: slugArg,
        email: { type: "string", description: "The lead's email address." },
      },
      required: ["slug", "email"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const email = String(args.email).trim().toLowerCase();
      if (!email.includes("@")) {
        throw new ToolInputError(`"${email}" isn't an email address.`);
      }
      const snapshot = await currentSnapshot(offer.id);
      if (!snapshot) {
        throw new ToolInputError(
          `${offer.name} has no synced tracking sheet yet, so there are no lead journeys to read.`,
        );
      }
      const aliases = await aliasMapForClient(offer.id);
      const canonical = resolveEmail(email, aliases) ?? email;
      const inboxes = [canonical];
      for (const [alias, target] of aliases) {
        if (target === canonical && !inboxes.includes(alias)) inboxes.push(alias);
      }
      const lead = await leadByEmail(
        snapshot.syncId,
        canonical,
        inboxes,
        await appEocLeadRows(offer.id),
      );
      if (!lead) {
        throw new ToolInputError(`No lead with ${email} on ${offer.name}.`);
      }
      const tags =
        tagsByLead(await listLeadTags(offer.id), aliases).get(canonical) ?? [];
      return {
        email: lead.email,
        inboxes,
        tags,
        name: lead.name,
        reps: lead.reps,
        firstSeen: iso(lead.firstSeen),
        lastSeen: iso(lead.lastSeen),
        applied: lead.applied,
        callsBooked: lead.callsBooked,
        endOfCallReports: lead.eocReports,
        deals: lead.deals,
        paymentsNet: dollars(lead.paymentsCents),
        latestStatus: lead.latestStatus,
        events: lead.events.map((e) => ({
          tab: e.tab,
          at: iso(e.occurredAt),
          status: e.status ?? e.outcome,
          rep: e.rep,
          cash: dollars(e.cashCents),
        })),
      };
    },
  },
  {
    name: "calls_by_closer",
    description:
      "The offer's held calls re-cut per closer: held, shows, no-shows, closes, show and close rate. Calls with no report yet and reports naming no closer get their own rows, and the rows always add up to the total.",
    inputSchema: {
      type: "object",
      properties: { slug: slugArg },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const { log } = await loadCallLog(
        offer.id,
        offer.countedCallSources ?? null,
        new Date(),
      );
      const { rows, total } = segmentByCloser(log);
      return { closers: rows.map(segment), total: segment(total) };
    },
  },
  {
    name: "calls_by_setter",
    description:
      "The offer's held calls re-cut per setter (the setter named on each end-of-call report): held, shows, no-shows, closes, show and close rate. Calls with no report yet and reports naming no setter get their own rows, and the rows always add up to the total.",
    inputSchema: {
      type: "object",
      properties: { slug: slugArg },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const { log } = await loadCallLog(
        offer.id,
        offer.countedCallSources ?? null,
        new Date(),
      );
      const { rows, total } = segmentBySetter(log);
      const bySetter = (x: CloserSegment) => {
        const { closer, ...rest } = segment(x);
        return { setter: closer, ...rest };
      };
      return { setters: rows.map(bySetter), total: bySetter(total) };
    },
  },
  {
    name: "list_leads",
    description:
      "The offer's leads, filtered the way the Leads page filters them: by a saved view's name, or by tag, stage (applied, booked, unbooked = applied but never booked, reported, paid), rep, and text. Also returns every tag with how many people carry it, and the saved views.",
    inputSchema: {
      type: "object",
      properties: {
        slug: slugArg,
        view: {
          type: "string",
          description:
            "A saved view's name (case doesn't matter). Overrides the other filters.",
        },
        tag: { type: "string", description: "Only leads carrying this tag." },
        has: {
          type: "string",
          description: "Where the lead got to.",
          enum: LEAD_HAS.map((h) => h.key),
        },
        rep: { type: "string", description: "Only leads this rep touched." },
        q: { type: "string", description: "Text search on email, name or rep." },
        limit: {
          type: "integer",
          description: "How many leads, 1 to 200 (default 50).",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const limit = args.limit === undefined ? 50 : Number(args.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new ToolInputError("limit must be a whole number between 1 and 200.");
      }
      const snapshot = await currentSnapshot(offer.id);
      if (!snapshot) {
        throw new ToolInputError(
          `${offer.name} has no synced tracking sheet yet, so there are no leads to list.`,
        );
      }
      const [appRows, aliases, tagRows, views] = await Promise.all([
        appEocLeadRows(offer.id),
        aliasMapForClient(offer.id),
        listLeadTags(offer.id),
        listLeadViews(offer.id),
      ]);

      let filters: LeadFilters;
      if (args.view !== undefined) {
        const wanted = String(args.view).trim().toLowerCase();
        const view = views.find((v) => v.name.toLowerCase() === wanted);
        if (!view) {
          throw new ToolInputError(
            `No saved view called "${String(args.view)}". Saved views: ${
              views.map((v) => v.name).join(", ") || "none yet"
            }.`,
          );
        }
        filters = readLeadFilters(Object.fromEntries(new URLSearchParams(view.query)));
      } else {
        filters = readLeadFilters({
          q: args.q === undefined ? undefined : String(args.q),
          tag: args.tag === undefined ? undefined : String(args.tag),
          has: args.has === undefined ? undefined : String(args.has),
          rep: args.rep === undefined ? undefined : String(args.rep),
        });
      }

      const all = await leadsForClient(snapshot.syncId, appRows, aliases);
      const tags = tagsByLead(tagRows, aliases);
      const leads = filterLeads(all, filters, tags);
      return {
        filters: describeFilters(filters),
        matching: leads.length,
        leads: leads.slice(0, limit).map((l) => ({
          email: l.email,
          name: l.name,
          reps: l.reps,
          tags: tags.get(l.email.toLowerCase()) ?? [],
          applied: l.applied,
          callsBooked: l.callsBooked,
          endOfCallReports: l.eocReports,
          paymentsNet: dollars(l.paymentsCents),
          latestStatus: l.latestStatus,
          lastSeen: iso(l.lastSeen),
        })),
        tags: tagUsage(tags),
        savedViews: views.map((v) => ({
          name: v.name,
          filters: describeFilters(
            readLeadFilters(Object.fromEntries(new URLSearchParams(v.query))),
          ),
        })),
      };
    },
  },
  {
    name: "offer_numbers",
    description:
      "Every number the offer's Numbers page shows, for one window: cash (collected, payers, average order, refunds, failed charges, what tag rules hid, cash by tag / hour / day, paid with no call first), applications and speed to lead, booked calls, confirmation (including by seat and confirmed-then-cancelled), verdicts and their rates, how closes paid, money reported on calls, and dialing at dial / attempt / lead-day grain by rep. Rates are whole percents named with their denominator; null means unknown, never zero.",
    inputSchema: {
      type: "object",
      properties: {
        slug: slugArg,
        range: {
          type: "string",
          description: "The window. Default life (all time).",
          enum: REPORT_RANGES.map((r) => r.key),
        },
        timezone: {
          type: "string",
          description:
            'IANA time zone whose calendar days bound the window, e.g. "America/New_York". Default America/Chicago.',
        },
        closer: {
          type: "string",
          description:
            "Cut calls and dialing to one closer (a name from calls_by_closer). Cash and applications stay whole-offer.",
        },
        setter: {
          type: "string",
          description:
            "Cut calls and dialing to one setter (a name from calls_by_setter). Use closer or setter, not both.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => {
      const offer = await offerBySlug(args.slug);
      const range = (args.range ?? "life") as ReportRange;
      if (!REPORT_RANGES.some((r) => r.key === range)) {
        throw new ToolInputError(
          `range must be one of ${REPORT_RANGES.map((r) => r.key).join(", ")}.`,
        );
      }
      const timeZone = String(args.timezone ?? "America/Chicago");
      try {
        new Intl.DateTimeFormat("en-US", { timeZone });
      } catch {
        throw new ToolInputError(
          `"${timeZone}" is not an IANA time zone. Use a name like America/New_York.`,
        );
      }
      if (args.closer !== undefined && args.setter !== undefined) {
        throw new ToolInputError("Pass closer or setter, not both.");
      }
      const who =
        args.closer !== undefined
          ? `closer:${String(args.closer)}`
          : args.setter !== undefined
            ? `setter:${String(args.setter)}`
            : undefined;
      const numbers = await loadOfferNumbers(
        offer.id,
        offer.countedCallSources ?? null,
        range,
        timeZone,
        new Date(),
        who,
      );
      if (who && !numbers.person) {
        const list =
          args.closer !== undefined
            ? numbers.personOptions.closers
            : numbers.personOptions.setters;
        throw new ToolInputError(
          `No ${args.closer !== undefined ? "closer" : "setter"} on this offer's reports is called "${String(args.closer ?? args.setter)}". Names on file: ${list.length ? list.join(", ") : "none"}.`,
        );
      }
      return { offer: offer.slug, timeZone, ...numbersForMcp(numbers) };
    },
  },
  {
    name: "integrity_status",
    description:
      "Money-integrity alerts nobody has reviewed yet: sheet drift and Money Spine reconciliation drift. An empty list means no alert is waiting, not that the books were re-checked this second.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const banner = await unreviewedIntegrityBanner();
      return banner
        ? { unreviewed: banner.count, severity: banner.severity, alerts: banner.lines }
        : { unreviewed: 0, alerts: [] };
    },
  },
];
