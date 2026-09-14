import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { appEocLeadRows } from "@/lib/calls/eoc-store";
import { loadCallLog } from "@/lib/calls/call-log-loader";
import { CALL_STATES, type CallState } from "@/lib/calls/call-log";
import { getClientReport } from "@/lib/clients/report";
import { unreviewedIntegrityBanner } from "@/lib/notifications/count";
import { COHORTS } from "@/lib/students/board";
import { loadStudentsBoard } from "@/lib/students/loader";
import { resolveEmail } from "@/lib/tracking/aliases";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import { loadOfferSales } from "@/lib/tracking/offer-metrics-loader";
import { currentSnapshot, leadByEmail } from "@/lib/tracking/queries";
import { ToolInputError, type ToolDefinition } from "@/lib/mcp/protocol";

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
          confirmation: r.confirmation,
          outcome: r.outcome,
          outcomeWords: r.outcomeWords,
          recordedIn: r.reportSource === "app" ? "gv-os" : r.reportSource,
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
        students: data.board.students
          .filter((s) => !cohort || s.cohort === cohort)
          .map((s) => ({
            name: s.name,
            email: s.email,
            weeksIn: s.weeksIn,
            cohort: s.cohort,
            firstPaidAt: iso(s.firstPaidAt),
            payments: s.payments,
            paidNet: dollars(s.netCents),
            refunded: s.refunded,
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
      return {
        email: lead.email,
        inboxes,
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
