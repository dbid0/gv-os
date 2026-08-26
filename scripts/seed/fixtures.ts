/**
 * Deterministic FAKE fixtures for GV OS staging.
 *
 * Every value here is synthetic and every date is derived from a fixed ANCHOR
 * constant (never the wall clock), so `buildSeedData(new Rng(SEED))` yields
 * byte-for-byte the same data on every run. The numbers deliberately look like
 * a real agency's book — but they are invented, and the client NAMES mirror the
 * real roster only as recognisable demo fixtures.
 *
 * Nothing in here does I/O. It returns plain rows shaped exactly like the
 * Drizzle insert types; run.ts is the only part that touches the database.
 */

import type { InferInsertModel } from "drizzle-orm";

import type {
  NewActionItem,
  NewActivityReport,
  NewClient,
  NewDeal,
  NewEodTemplate,
  NewIntegration,
  NewProfile,
  NewRep,
  NewTeamMember,
} from "@/db/schema/app";
import type {
  ActivityLog,
  Notification,
  OfferSettings,
  Transaction,
} from "@/db/schema/app";
import {
  kitSnapshots as kitSnapshotsTable,
  quotas,
  revShareRules as revShareRulesTable,
} from "@/db/schema/app";
import type { NewMoneyEvent } from "@/db/schema/ledger";

import { Rng } from "./rng";

type NewKitSnapshot = InferInsertModel<typeof kitSnapshotsTable>;
type NewRevShareRule = InferInsertModel<typeof revShareRulesTable>;

/** The schema exports no `Quota` select type, so derive it from the table. */
type Quota = typeof quotas.$inferSelect;

// -------------------------------------------------------------- Constants

/** The one place the whole dataset anchors to. Bump this to "re-date" the seed. */
export const ANCHOR_DAY = "2026-08-23";

/** Fixed PRNG seed — the source of all determinism. */
export const SEED = 0x9e3779b9;

/** Marker stamped on every seeded row so the reset only ever removes its own. */
export const MARKER = "demo-seed";

/** Demo-only email domain, so seeded people are unmistakable and removable. */
export const DEMO_EMAIL_DOMAIN = "demo.gv-os.local";

// Insert-shaped rows can carry an explicit id; the schema defaults it otherwise.
type WithId<T> = T & { id: string };

export interface SeedData {
  profiles: WithId<NewProfile>[];
  clients: WithId<NewClient>[];
  reps: WithId<NewRep>[];
  teamMembers: WithId<NewTeamMember>[];
  deals: WithId<NewDeal>[];
  activityReports: WithId<NewActivityReport>[];
  eodTemplates: WithId<NewEodTemplate>[];
  quotas: Partial<Quota>[];
  activityLogs: Partial<ActivityLog>[];
  notifications: Partial<Notification>[];
  offerSettings: Partial<OfferSettings>[];
  transactions: Partial<Transaction>[];
  moneyEvents: Partial<NewMoneyEvent>[];
  revShareRules: WithId<NewRevShareRule>[];
  integrations: WithId<NewIntegration>[];
  kitSnapshots: WithId<NewKitSnapshot>[];
  actionItems: WithId<NewActionItem>[];
}

// -------------------------------------------------------------- Date helpers

const DAY_MS = 86_400_000;

/** Shift a yyyy-mm-dd key by whole days (UTC-noon math, DST-proof). */
export function shiftDay(dayKey: string, deltaDays: number): string {
  const t = Date.parse(`${dayKey}T12:00:00Z`) + deltaDays * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** A timestamp at 12:00 UTC on a day key — lands on the right CT business day. */
export function noonUtc(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`);
}

/** Weekday 0=Sun … 6=Sat for a day key. */
export function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay();
}

function isWeekday(dayKey: string): boolean {
  const d = weekdayOf(dayKey);
  return d >= 1 && d <= 5;
}

/** yyyy-mm for a day key. */
function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

// -------------------------------------------------------------- Vocab pools

const FIRST_NAMES = [
  "Marco",
  "Priya",
  "Devon",
  "Sofia",
  "Elias",
  "Nadia",
  "Trey",
  "Camila",
  "Bilal",
  "Hana",
  "Quinn",
  "Rowan",
  "Yusuf",
  "Delia",
  "Kofi",
  "Mira",
  "Santi",
  "Aria",
  "Dorian",
  "Freya",
  "Nico",
  "Zara",
  "Cole",
  "Ivy",
  "Rhys",
  "Talia",
] as const;

const LAST_NAMES = [
  "Alvarez",
  "Nakamura",
  "Okafor",
  "Petrov",
  "Haddad",
  "Sørensen",
  "Delgado",
  "Bianchi",
  "Ferreira",
  "Kowalski",
  "Mbeki",
  "Larsen",
  "Rahimi",
  "Costa",
  "Novak",
  "Bauer",
] as const;

const CUSTOMER_COMPANIES = [
  "Northwind Media",
  "Apex Trading Co",
  "Lumen Agency",
  "Cedar & Co",
  "Vertex Consulting",
  "Harbor Digital",
  "Ironclad Sales",
  "Bright Labs",
  "Meridian Group",
  "Solace Studios",
  "Kestrel Ventures",
  "Onyx Collective",
  "Summit Realty",
  "Draft House Co",
  "Pioneer & Fox",
] as const;

const OFFERS: Record<string, string[]> = {
  "demo-the-grid": ["Operation Room", "Grid Accelerator", "Mastermind"],
  "demo-the-vault": [
    "UGC Vault Program",
    "Creator Accelerator",
    "Done-With-You Install",
  ],
  "demo-racks-closes": ["Closer Certification", "Placement Program", "Sales Mastery"],
  "demo-the-visionary": ["Creative Retainer", "Brand Studio", "Visionary Cohort"],
};

const DEAL_TYPES = [
  "Setup",
  "DFY Build",
  "DWY Build",
  "Retainer",
  "Rev-Share",
  "Client Handoff",
  "Other",
] as const;

const SOURCES = ["inbound", "outbound", "referral", "paid_ads"] as const;
const LEAD_SOURCES = [
  "Instagram DM",
  "YouTube",
  "Paid Ads",
  "Referral",
  "Cold Email",
  "Webinar",
] as const;
const PAYMENT_METHODS = ["stripe", "wire", "ach", "fanbasis", "whop"] as const;
const PROCESSOR_METHODS = new Set(["stripe", "fanbasis", "whop"]);

const CONTRACT_TIERS_CENTS = [
  100_000, 150_000, 250_000, 300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_500_000,
] as const;

// -------------------------------------------------------------- Clients

interface ClientSpec {
  slug: string;
  name: string;
  monthlyTargetCents: number;
  defaultCloserBps: number;
  defaultSetterBps: number;
  defaultDmSetterBps: number;
  defaultManagerBps: number;
  deductProcessorFees: boolean;
  timezone: string;
}

const CLIENT_SPECS: ClientSpec[] = [
  {
    slug: "demo-the-grid",
    name: "The Grid",
    monthlyTargetCents: 3_000_000,
    defaultCloserBps: 1200,
    defaultSetterBps: 300,
    defaultDmSetterBps: 200,
    defaultManagerBps: 500,
    deductProcessorFees: true,
    timezone: "America/Chicago",
  },
  {
    slug: "demo-the-vault",
    name: "The Vault",
    monthlyTargetCents: 2_000_000,
    defaultCloserBps: 1000,
    defaultSetterBps: 300,
    defaultDmSetterBps: 250,
    defaultManagerBps: 400,
    deductProcessorFees: true,
    timezone: "America/New_York",
  },
  {
    slug: "demo-racks-closes",
    name: "Racks Closes",
    monthlyTargetCents: 4_000_000,
    defaultCloserBps: 1500,
    defaultSetterBps: 400,
    defaultDmSetterBps: 200,
    defaultManagerBps: 500,
    deductProcessorFees: false,
    timezone: "America/Chicago",
  },
  {
    slug: "demo-the-visionary",
    name: "The Visionary",
    monthlyTargetCents: 1_500_000,
    defaultCloserBps: 1000,
    defaultSetterBps: 300,
    defaultDmSetterBps: 200,
    defaultManagerBps: 400,
    deductProcessorFees: true,
    timezone: "America/New_York",
  },
];

// Per-client rep composition. Managers file EOW; the rest file daily EOD.
const REP_COMPOSITION: { role: string; count: number }[] = [
  { role: "manager", count: 1 },
  { role: "closer", count: 2 },
  { role: "setter", count: 2 },
  { role: "dm_setter", count: 1 },
];

// -------------------------------------------------------------- Builders

function fullName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Deterministic fallback keeps names unique without ever looping forever.
  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)} ${used.size}`;
  used.add(name);
  return name;
}

/**
 * One day's activity for a rep, as an INTERNALLY CONSISTENT funnel.
 *
 * Every count downstream is a rounded conversion of the count above it —
 * dials → connects → sets → shows — and a conversion rate is always < 1. So on
 * any single report, and therefore on any sum of reports, `shows ≤ sets_booked`,
 * `shows ≤ calls_taken`, `sets_booked ≤ connects ≤ dials`, and `no_shows ≥ 0`
 * hold by construction. That is what keeps every rate the app derives
 * (Leaderboard Show %, the EOD page's show rate, the template set/close rates)
 * at or below 100% for every role, and lands them in believable bands:
 * show 45–72%, set rate a single-digit slice of dials.
 *
 * For a closer/manager the appointments on their calendar are the calls taken
 * AND the sets that reached them, so `calls_taken === sets_booked === appts` —
 * that is the fix for the old data, where closers logged many shows against
 * near-zero sets and the Leaderboard read impossible 400–900% show rates.
 *
 * Setters and DM setters BOOK sets; the shows happen on a closer's calendar, so
 * they carry no `shows` of their own — faithful to the model, and it keeps the
 * headline close rate (deals ÷ shows) honest by not padding the denominator
 * with shows no one attributed to a closer.
 */
function buildDayMetrics(role: string, rng: Rng): Record<string, number> {
  const showRate = 0.45 + rng.next() * 0.27; // 45–72%
  switch (role) {
    case "setter": {
      const dials = rng.int(40, 95);
      const connects = Math.round(dials * (0.25 + rng.next() * 0.17)); // 25–42%
      const sets = Math.round(connects * (0.18 + rng.next() * 0.2)); // 18–38%
      return {
        dials,
        connects,
        sets_booked: sets,
        follow_up_calls: rng.int(1, 5),
        cancelled_calls: rng.int(0, 2),
      };
    }
    case "dm_setter": {
      const dmsSent = rng.int(60, 150);
      const connects = Math.round(dmsSent * (0.12 + rng.next() * 0.13)); // 12–25%
      const sets = Math.round(connects * (0.2 + rng.next() * 0.18)); // 20–38%
      return {
        dms_sent: dmsSent,
        connects,
        sets_booked: sets,
        dials: rng.int(0, 12),
        follow_up_calls: rng.int(1, 4),
      };
    }
    case "closer": {
      const appts = rng.int(2, 4); // appointments on the calendar
      const shows = Math.round(appts * showRate);
      const dials = rng.int(5, 22);
      return {
        calls_taken: appts,
        sets_booked: appts,
        shows,
        no_shows: appts - shows,
        follow_up_calls: rng.int(2, 8),
        dials,
        connects: Math.round(dials * (0.3 + rng.next() * 0.2)),
      };
    }
    default: {
      // Manager: a lighter coaching-call load, still internally consistent.
      const appts = rng.int(3, 8);
      const shows = Math.round(appts * showRate);
      const dials = rng.int(0, 10);
      return {
        calls_taken: appts,
        sets_booked: appts,
        shows,
        no_shows: appts - shows,
        dials,
        connects: Math.round(dials * (0.3 + rng.next() * 0.2)),
      };
    }
  }
}

/** The daily wellbeing check-in (1–5): mostly healthy, occasionally below 3 so
 *  the "check on this rep" manager alert has real data. Drawn from a side rng so
 *  adding it never perturbs the main deal-derivation stream. */
function pickMood(rng: Rng): number {
  return rng.chance(0.12) ? rng.int(1, 2) : rng.int(3, 5);
}

export function buildSeedData(rng: Rng): SeedData {
  const usedNames = new Set<string>();

  // ---- Profiles (a handful of sign-in-able demo people) ----
  const profiles: WithId<NewProfile>[] = [];
  for (let i = 0; i < 4; i += 1) {
    const name = fullName(rng, usedNames);
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DEMO_EMAIL_DOMAIN}`;
    profiles.push({ id: rng.uuid(), email, fullName: name });
  }

  // ---- Clients ----
  const clients: WithId<NewClient>[] = CLIENT_SPECS.map((spec) => ({
    id: rng.uuid(),
    name: spec.name,
    slug: spec.slug,
    status: "active",
    externalRef: MARKER,
    monthlyTargetCents: spec.monthlyTargetCents,
    defaultCloserBps: spec.defaultCloserBps,
    defaultSetterBps: spec.defaultSetterBps,
    defaultDmSetterBps: spec.defaultDmSetterBps,
    defaultManagerBps: spec.defaultManagerBps,
    deductProcessorFees: spec.deductProcessorFees,
    processorFeeBps: spec.deductProcessorFees ? 290 : null,
    processorFeeFlatCents: spec.deductProcessorFees ? 30 : null,
  }));
  const clientBySlug = new Map(clients.map((c, i) => [CLIENT_SPECS[i].slug, c]));

  // ---- Reps ----
  const reps: WithId<NewRep>[] = [];
  let profileCursor = 0;
  for (const spec of CLIENT_SPECS) {
    const client = clientBySlug.get(spec.slug)!;
    let repIndex = 0;
    for (const comp of REP_COMPOSITION) {
      for (let n = 0; n < comp.count; n += 1) {
        const name = fullName(rng, usedNames);
        // Wire the first few reps to sign-in profiles.
        const profileId =
          profileCursor < profiles.length && rng.chance(0.5)
            ? profiles[profileCursor++].id
            : null;
        const isCloser = comp.role === "closer";
        const isManager = comp.role === "manager";
        reps.push({
          id: rng.uuid(),
          clientId: client.id,
          profileId,
          name,
          role: comp.role,
          commissionBps: isManager
            ? null
            : isCloser
              ? rng.roundInt(1000, 1600, 50)
              : rng.roundInt(200, 500, 50),
          basePayCents: rng.chance(0.4) ? rng.roundInt(100_000, 400_000, 50_000) : null,
          topLineSkimBps: isManager ? rng.roundInt(300, 600, 50) : null,
          status: "active",
          externalRef: `${MARKER}:rep:${spec.slug}:${repIndex}`,
        });
        repIndex += 1;
      }
    }
  }
  const repsByClient = new Map<string, WithId<NewRep>[]>();
  for (const rep of reps) {
    const list = repsByClient.get(rep.clientId as string) ?? [];
    list.push(rep);
    repsByClient.set(rep.clientId as string, list);
  }
  const sellersFor = (clientId: string) =>
    (repsByClient.get(clientId) ?? []).filter(
      (r) => r.role === "closer" || r.role === "setter" || r.role === "dm_setter",
    );

  // ---- Team members (agency crew + a couple client-scoped) ----
  const teamMembers: WithId<NewTeamMember>[] = [];
  const pushMember = (
    role: string,
    roleKey: string | null,
    clientId: string | null,
    repKind: string | null,
  ) => {
    const name = fullName(rng, usedNames);
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DEMO_EMAIL_DOMAIN}`;
    teamMembers.push({
      id: rng.uuid(),
      name,
      role,
      email,
      clientId,
      status: "active",
      roleKey,
      repKind,
      notes: `${MARKER} team member`,
    });
  };
  pushMember("operator", "sales_manager", null, null);
  pushMember("copywriter", "team_member", null, null);
  pushMember("va", "team_member", null, null);
  pushMember("creative_director", "team_member", null, null);
  pushMember("copywriter", "team_member", clients[0].id, null);
  pushMember("creative_director", "team_member", clients[1].id, null);

  // Per-client spec lookup (clients were built from CLIENT_SPECS in order).
  const specByClientId = new Map<string, ClientSpec>(
    clients.map((c, i) => [c.id as string, CLIENT_SPECS[i]]),
  );

  // Each closer's personal close rate — the believable slice of their shows
  // that becomes a closed deal, drawn once so their Close % is stable and in
  // band (17–36%). Only closers carry shows, so only closers produce deals.
  const closeRateByRep = new Map<string, number>();
  for (const rep of reps) {
    closeRateByRep.set(
      rep.id as string,
      rep.role === "closer" ? 0.17 + rng.next() * 0.19 : 0,
    );
  }

  // ---- Activity reports (daily EOD for sellers, daily BOD for managers) ----
  // Built first so each rep's total shows is known before deals are derived
  // from it, guaranteeing deals ≤ shows (Close % ≤ 100%) rep by rep. GV runs
  // only EOD + BOD — never an end-of-week form.
  const activityReports: WithId<NewActivityReport>[] = [];
  const showsByRep = new Map<string, number>();
  const addShows = (repId: string, m: Record<string, number>) =>
    showsByRep.set(repId, (showsByRep.get(repId) ?? 0) + (m.shows ?? 0));
  // A side stream for everything ADDED to the seed since it was first tuned —
  // the wellbeing check-in and the managers' extra daily BOD reports — so none
  // of it disturbs the seller→deal numbers the close-rate band depends on. The
  // main rng's consumption stays byte-identical to the original seed.
  const sideRng = new Rng(SEED ^ 0x5eedbeef);
  const ACTIVITY_DAYS = 42;
  for (const rep of reps) {
    const isManager = rep.role === "manager";
    for (let back = ACTIVITY_DAYS; back >= 0; back -= 1) {
      const day = shiftDay(ANCHOR_DAY, -back);
      if (!isWeekday(day)) continue;
      if (isManager) {
        // Managers file a beginning-of-day plan each weekday (with the odd
        // miss). A BOD is forward-looking, so it carries no shows and never
        // counts toward the close-rate denominator. Drawn entirely from the
        // side stream so it can't disturb the seller→deal numbers.
        if (!sideRng.chance(0.85)) continue;
        const metrics: Record<string, number> = {
          calls_taken: sideRng.int(2, 6),
          dials: sideRng.int(2, 12),
          mood: pickMood(sideRng),
        };
        activityReports.push({
          id: sideRng.uuid(),
          repId: rep.id,
          clientId: rep.clientId,
          reportDate: noonUtc(day),
          kind: "bod",
          metrics,
          notes: null,
          externalRef: `${MARKER}:ar:${rep.externalRef}:${day}`,
        });
        continue;
      }
      // Sellers file daily, with the occasional miss (keeps compliance honest).
      if (!rng.chance(0.9)) continue;
      const metrics = buildDayMetrics(rep.role, rng);
      metrics.mood = pickMood(sideRng);
      addShows(rep.id as string, metrics);
      activityReports.push({
        id: rng.uuid(),
        repId: rep.id,
        clientId: rep.clientId,
        reportDate: noonUtc(day),
        kind: "eod",
        metrics,
        notes: rng.chance(0.15) ? `${MARKER}: solid day, pipeline building.` : null,
        externalRef: `${MARKER}:ar:${rep.externalRef}:${day}`,
      });
    }
  }

  // ---- Deals (derived from each rep's shows, so Close % lands in band) ----
  const deals: WithId<NewDeal>[] = [];
  let dealIndex = 0;
  for (const rep of reps) {
    const shows = showsByRep.get(rep.id as string) ?? 0;
    const rate = closeRateByRep.get(rep.id as string) ?? 0;
    let dealCount = Math.round(rate * shows);
    // A producing closer always books at least one, so their cash lights up.
    if (rep.role === "closer" && shows > 0) dealCount = Math.max(1, dealCount);
    const spec = specByClientId.get(rep.clientId as string)!;
    for (let n = 0; n < dealCount; n += 1) {
      const closedDay = shiftDay(ANCHOR_DAY, -rng.int(0, ACTIVITY_DAYS - 1));
      const recurrence = rng.chance(0.35) ? "recurring" : "one_time";
      const contract = rng.pick(CONTRACT_TIERS_CENTS);
      const signed = rng.chance(0.85);
      const customer = rng.pick(CUSTOMER_COMPANIES);
      deals.push({
        id: rng.uuid(),
        clientId: rep.clientId,
        dealType: rng.pick(DEAL_TYPES),
        offer: rng.pick(OFFERS[spec.slug]),
        contractValueCents: contract,
        closedAt: noonUtc(closedDay),
        agreementSigned: signed ? "signed" : null,
        notes: `${MARKER} deal`,
        repId: rep.id,
        recurrence,
        source: rng.pick(SOURCES),
        leadSource: rng.pick(LEAD_SOURCES),
        customerName: customer,
        externalRef: `${MARKER}:deal:${dealIndex}`,
      });
      dealIndex += 1;
    }
  }

  // ---- Ledger money events (collected cash tied to each deal) ----
  // These are what light up rep Cash on the Leaderboard and the gamification
  // "best cash day": both read payment_received rows from the immutable ledger,
  // joined to a rep through the deal. Deal-level payments carry no repId (per
  // the schema); attribution flows deal → rep. STAGING-ONLY, marker-tagged,
  // idempotent via the unique idempotency key, and cleared by the same
  // trigger-disable reset the transactions backlog already uses.
  const CASH_PROCESSORS = ["stripe", "fanbasis", "whop", "wire", "ach"] as const;
  const moneyEvents: Partial<NewMoneyEvent>[] = [];
  let moneyIndex = 0;
  for (const deal of deals) {
    const contract = deal.contractValueCents as number;
    // Most deals fully collect; some sit on a deposit (leaves believable AR).
    const cash = rng.chance(0.82)
      ? contract
      : Math.round(contract * rng.pick([0.5, 0.34, 0.25]));
    moneyEvents.push({
      id: rng.uuid(),
      occurredAt: deal.closedAt as Date,
      recordedAt: deal.closedAt as Date,
      eventType: "payment_received",
      amountCents: cash,
      currency: "USD",
      clientId: deal.clientId,
      dealId: deal.id,
      repId: null,
      processor: rng.pick(CASH_PROCESSORS),
      source: "import",
      idempotencyKey: `${MARKER}:money:${moneyIndex}`,
      memo: `${MARKER} payment`,
    });
    moneyIndex += 1;
  }

  // ---- EOD templates (one per client per role) ----
  const eodTemplates: WithId<NewEodTemplate>[] = [];
  for (const spec of CLIENT_SPECS) {
    const client = clientBySlug.get(spec.slug)!;
    const roleTemplates: {
      role: string;
      cadence: string;
      name: string;
      baseFields: string[];
      calc?: { key: string; label: string; numerator: string; denominator: string };
    }[] = [
      {
        role: "closer",
        cadence: "eod",
        name: "Closer EOD",
        baseFields: ["calls_taken", "shows", "no_shows", "follow_up_calls"],
        calc: {
          key: "show_rate",
          label: "Show rate",
          numerator: "shows",
          denominator: "calls_taken",
        },
      },
      {
        role: "setter",
        cadence: "eod",
        name: "Setter EOD",
        baseFields: ["dials", "connects", "sets_booked", "follow_up_calls"],
        calc: {
          key: "set_rate",
          label: "Set rate",
          numerator: "sets_booked",
          denominator: "dials",
        },
      },
      {
        role: "dm_setter",
        cadence: "eod",
        name: "DM Setter EOD",
        baseFields: ["dms_sent", "connects", "sets_booked"],
        calc: {
          key: "dm_set_rate",
          label: "DM set rate",
          numerator: "sets_booked",
          denominator: "dms_sent",
        },
      },
      {
        role: "manager",
        cadence: "bod",
        name: "Manager BOD",
        baseFields: ["calls_taken", "shows", "dials"],
      },
    ];
    for (const t of roleTemplates) {
      eodTemplates.push({
        id: rng.uuid(),
        clientId: client.id,
        role: t.role,
        cadence: t.cadence,
        name: t.name,
        baseFields: t.baseFields,
        customFields: [
          {
            key: "mood",
            label: "How are you feeling today? (1-5)",
            type: "number",
            showOnDashboard: false,
          },
        ],
        calcFields: t.calc
          ? [
              {
                key: t.calc.key,
                label: t.calc.label,
                format: "percent",
                numerator: t.calc.numerator,
                denominator: t.calc.denominator,
                showOnDashboard: true,
              },
            ]
          : [],
        isActive: true,
        externalRef: `${MARKER}:tmpl:${spec.slug}:${t.role}`,
      });
    }
  }

  // ---- Quotas (team + rep, anchor month and prior month) ----
  const quotas: Partial<Quota>[] = [];
  const anchorMonth = monthOf(ANCHOR_DAY); // e.g. 2026-08
  const priorMonth = monthOf(shiftDay(`${anchorMonth}-01`, -1));
  const periods = [anchorMonth, priorMonth];
  for (const spec of CLIENT_SPECS) {
    const client = clientBySlug.get(spec.slug)!;
    for (const period of periods) {
      // Team quotas on data-derived metrics (light up without touching money).
      quotas.push({
        id: rng.uuid(),
        scope: "team",
        repId: null,
        clientId: client.id,
        metric: "deals",
        targetAmount: rng.int(8, 20),
        period,
        notes: `${MARKER} team deals target`,
      });
      quotas.push({
        id: rng.uuid(),
        scope: "team",
        repId: null,
        clientId: client.id,
        metric: "shows",
        targetAmount: rng.int(60, 160),
        period,
        notes: `${MARKER} team shows target`,
      });
    }
  }
  // Rep quotas for a representative slice of reps.
  for (const rep of reps.filter((r) => r.role !== "manager")) {
    if (!rng.chance(0.6)) continue;
    const metric =
      rep.role === "closer"
        ? rng.pick(["deals", "shows"])
        : rng.pick(["dials", "sets_booked"]);
    const target =
      metric === "deals"
        ? rng.int(3, 9)
        : metric === "shows"
          ? rng.int(20, 60)
          : metric === "sets_booked"
            ? rng.int(30, 90)
            : rng.int(600, 1400);
    quotas.push({
      id: rng.uuid(),
      scope: "rep",
      repId: rep.id,
      clientId: rep.clientId,
      metric,
      targetAmount: target,
      period: anchorMonth,
      notes: `${MARKER} rep target`,
    });
  }

  // ---- Activity logs (Call Log) ----
  const activityLogs: Partial<ActivityLog>[] = [];
  const DISPOSITIONS = [
    "sale_closed",
    "follow_up_booked",
    "rescheduled",
    "not_interested",
    "no_show",
    "dq",
    "wrong_number",
    "bad_lead",
  ] as const;
  const DISPOSITION_WEIGHTS = [12, 20, 10, 18, 15, 10, 8, 7];
  const CALL_TYPES = ["discovery", "close", "follow_up"] as const;
  const LOG_COUNT = 220;
  for (let i = 0; i < LOG_COUNT; i += 1) {
    const client = rng.pick(clients);
    const sellers = sellersFor(client.id as string);
    const rep = sellers.length ? rng.pick(sellers) : null;
    const mode = rng.chance(0.75) ? "call" : "booking";
    const day = shiftDay(ANCHOR_DAY, -rng.int(0, 34));
    // Keep the timestamp inside the same CT business day (13:00-23:00 UTC).
    const occurredAt = new Date(
      `${day}T${String(rng.int(13, 22)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:00Z`,
    );
    const disposition =
      mode === "booking"
        ? "follow_up_booked"
        : rng.weighted(DISPOSITIONS, DISPOSITION_WEIGHTS);
    const person = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    activityLogs.push({
      id: rng.uuid(),
      mode,
      clientId: client.id,
      repId: rep?.id ?? null,
      callType: rng.pick(CALL_TYPES),
      disposition,
      recordingUrl: rng.chance(0.5) ? `https://fathom.video/calls/${rng.uuid()}` : null,
      leadUrl: rng.chance(0.6) ? `https://app.close.com/lead/${rng.uuid()}` : null,
      customerName: person,
      customerEmail: `${person.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      notes: rng.chance(0.3) ? `${MARKER}: strong interest, sent proposal.` : null,
      occurredAt,
      source: "manual",
      externalRef: `${MARKER}:log:${i}`,
    });
  }

  // ---- Notifications ----
  const notifications: Partial<Notification>[] = [];
  const notifSpecs: {
    kind: string;
    severity: "info" | "warning" | "critical";
    title: string;
    body: string | null;
    clientIndex: number | null;
    read: boolean;
    daysAgo: number;
  }[] = [
    {
      kind: "agreement_signed",
      severity: "info",
      title: "Agreement signed: Operation Room",
      body: "Completed Aug 21",
      clientIndex: 0,
      read: false,
      daysAgo: 2,
    },
    {
      kind: "agreement_signed",
      severity: "info",
      title: "Agreement signed: UGC Vault Program",
      body: "Completed Aug 18",
      clientIndex: 1,
      read: true,
      daysAgo: 5,
    },
    {
      kind: "integration_stale",
      severity: "warning",
      title: "Grid Close account: no sync in over 26h",
      body: null,
      clientIndex: 0,
      read: false,
      daysAgo: 1,
    },
    {
      kind: "integration_stale",
      severity: "warning",
      title: "Vault Kit: no sync in over 26h",
      body: null,
      clientIndex: 1,
      read: false,
      daysAgo: 1,
    },
    {
      kind: "sheet_drift",
      severity: "critical",
      title: "Sheet drift: 3 rows, $42.10",
      body: "The reconciliation found NEW drift above the accepted 5-cent baseline.",
      clientIndex: null,
      read: false,
      daysAgo: 3,
    },
    {
      kind: "agreement_missing",
      severity: "warning",
      title: "Racks Closes: payment with no signed agreement",
      body: "A payment landed without a matching signed agreement.",
      clientIndex: 2,
      read: false,
      daysAgo: 4,
    },
    {
      kind: "sync_failure",
      severity: "critical",
      title: "Visionary Stripe: sync failing",
      body: "401 Unauthorized — reconnect the integration.",
      clientIndex: 3,
      read: false,
      daysAgo: 2,
    },
    {
      kind: "agreement_signed",
      severity: "info",
      title: "Agreement signed: Closer Certification",
      body: "Completed Aug 22",
      clientIndex: 2,
      read: false,
      daysAgo: 1,
    },
  ];
  for (let i = 0; i < notifSpecs.length; i += 1) {
    const s = notifSpecs[i];
    const created = noonUtc(shiftDay(ANCHOR_DAY, -s.daysAgo));
    notifications.push({
      id: rng.uuid(),
      kind: s.kind,
      severity: s.severity,
      title: s.title,
      body: s.body,
      clientId: s.clientIndex === null ? null : clients[s.clientIndex].id,
      dedupeKey: `${MARKER}:notif:${i}`,
      createdAt: created,
      readAt: s.read
        ? noonUtc(shiftDay(ANCHOR_DAY, -Math.max(0, s.daysAgo - 1)))
        : null,
    });
  }

  // ---- Offer settings (one per client) ----
  const offerSettings: Partial<OfferSettings>[] = CLIENT_SPECS.map((spec) => {
    const client = clientBySlug.get(spec.slug)!;
    return {
      id: rng.uuid(),
      clientId: client.id,
      timezone: spec.timezone,
      eodAlertTime: "17:00",
      bodAlertTime: "09:00",
      confettiThresholdCents: 500_000,
      visibility: { sales: true, activity: true, cash: false },
    };
  });

  // ---- Transactions (the dashboard's source of truth) ----
  const transactions: Partial<Transaction>[] = [];
  let txn = 0;
  const pushTxn = (row: Partial<Transaction>) => {
    transactions.push({
      id: rng.uuid(),
      external: false,
      enteredBy: MARKER,
      idempotencyKey: `${MARKER}:txn:${txn}`,
      ...row,
    });
    txn += 1;
  };
  const EXPENSE_LABELS: { label: string; category: string }[] = [
    { label: "Vercel Pro", category: "software" },
    { label: "Supabase", category: "software" },
    { label: "Close CRM seats", category: "tools" },
    { label: "Kit (email)", category: "tools" },
    { label: "Meta Ads", category: "ads" },
    { label: "Copywriter retainer", category: "contractors" },
    { label: "Zapier", category: "tools" },
    { label: "PandaDoc", category: "software" },
  ];

  for (const spec of CLIENT_SPECS) {
    const client = clientBySlug.get(spec.slug)!;
    // Client-layer collected payments — the "customer payments".
    for (let n = 0; n < 26; n += 1) {
      const day = shiftDay(ANCHOR_DAY, -rng.int(0, 89));
      const method = rng.pick(PAYMENT_METHODS);
      const revenue = rng.pick(CONTRACT_TIERS_CENTS);
      // Occasionally only a deposit collected (leaves believable AR).
      const cash = rng.chance(0.85)
        ? revenue
        : Math.round(revenue * rng.pick([0.5, 0.33]));
      const fee =
        spec.deductProcessorFees && PROCESSOR_METHODS.has(method)
          ? Math.round(cash * 0.029) + 30
          : 0;
      const customer = rng.pick(CUSTOMER_COMPANIES);
      const offer = rng.pick(OFFERS[spec.slug]);
      pushTxn({
        occurredOn: day,
        occurredAt: noonUtc(day),
        direction: "in",
        layer: "client",
        clientId: client.id,
        dealType: rng.pick(DEAL_TYPES),
        offer,
        description: `${offer} — ${customer}`,
        paymentMethod: method,
        revenueCents: revenue,
        cashCents: cash,
        processorFeeCents: fee,
        agreementSigned: rng.chance(0.85),
        leadEmail: `${customer.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        source: PROCESSOR_METHODS.has(method) ? "processor" : "form",
      });
    }
    // Agency-layer income tied to this client (setup fees + rev-share received).
    for (let n = 0; n < 6; n += 1) {
      const day = shiftDay(ANCHOR_DAY, -rng.int(0, 89));
      const isSetup = rng.chance(0.5);
      const amount = isSetup
        ? rng.roundInt(150_000, 500_000, 50_000)
        : rng.roundInt(200_000, 1_200_000, 50_000);
      pushTxn({
        occurredOn: day,
        occurredAt: noonUtc(day),
        direction: "in",
        layer: "agency",
        clientId: client.id,
        dealType: isSetup ? "Setup" : "Rev-Share",
        offer: null,
        description: isSetup
          ? `Setup fee — ${spec.name}`
          : `Rev-share received — ${spec.name}`,
        paymentMethod: rng.pick(["wire", "ach", "stripe"]),
        revenueCents: amount,
        cashCents: amount,
        processorFeeCents: 0,
        agreementSigned: true,
        leadEmail: null,
        source: rng.pick(["manual", "sheet"]),
      });
    }
  }
  // Agency-layer expenses (money out).
  for (let n = 0; n < 26; n += 1) {
    const day = shiftDay(ANCHOR_DAY, -rng.int(0, 89));
    const exp = rng.pick(EXPENSE_LABELS);
    const amount = rng.roundInt(5_000, 120_000, 1_000);
    pushTxn({
      occurredOn: day,
      occurredAt: noonUtc(day),
      direction: "out",
      layer: "agency",
      clientId: null,
      dealType: "Other",
      offer: null,
      description: exp.label,
      paymentMethod: rng.pick(["ach", "stripe", "wire"]),
      revenueCents: 0,
      cashCents: amount,
      processorFeeCents: 0,
      agreementSigned: null,
      leadEmail: null,
      source: "manual",
      notes: `${MARKER} expense (${exp.category})`,
    });
  }

  // ---- Rev-share rules (one locked rate per client) ----
  // Safe for the Money Spine: the reconciler derives the basis from the same
  // client-layer transactions (cash − fees), so basis drift stays 0.
  const REVSHARE_BPS: Record<string, { bps: number; deductAdSpend: boolean }> = {
    "demo-the-grid": { bps: 2000, deductAdSpend: false },
    "demo-the-vault": { bps: 1500, deductAdSpend: false },
    "demo-racks-closes": { bps: 1000, deductAdSpend: true },
    "demo-the-visionary": { bps: 3000, deductAdSpend: false },
  };
  const revShareRules: WithId<NewRevShareRule>[] = clients.map((c, i) => {
    const rule = REVSHARE_BPS[CLIENT_SPECS[i].slug] ?? {
      bps: 1500,
      deductAdSpend: false,
    };
    return {
      id: rng.uuid(),
      clientId: c.id,
      rateBps: rule.bps,
      effectiveFrom: shiftDay(ANCHOR_DAY, -140),
      deductAdSpend: rule.deductAdSpend,
      note: `${MARKER} rate`,
    };
  });

  // ---- Email: a connected Kit account + a snapshot per client ----
  // Kit is a NON-processor provider, so a connected integration here never
  // flips an offer's cash authority or touches the Money Spine.
  const SEQ_NAMES = [
    "Welcome sequence",
    "Application nurture",
    "Booked-call reminders",
    "No-show win-back",
    "Post-call follow-up",
    "Long-term nurture",
    "Re-engagement",
  ];
  const integrations: WithId<NewIntegration>[] = clients.map((c, i) => ({
    id: rng.uuid(),
    provider: "kit",
    label: `${CLIENT_SPECS[i].name} Kit`,
    clientId: c.id,
    status: "connected",
    secretHint: "…demo",
    config: { method: "api_key" },
    lastSyncAt: noonUtc(shiftDay(ANCHOR_DAY, -1)),
  }));
  const kitSnapshots: WithId<NewKitSnapshot>[] = integrations.map((intg, i) => {
    const seqCount = 4 + (i % 4); // 4–7 sequences
    return {
      id: rng.uuid(),
      integrationId: intg.id,
      clientId: intg.clientId,
      accountName: `${CLIENT_SPECS[i].name} Newsletter`,
      plan: "Creator Pro",
      sequenceCount: seqCount,
      tagCount: 8 + i * 3,
      subscriberCount: 1_200 + i * 900 + rng.int(0, 400),
      sequences: SEQ_NAMES.slice(0, seqCount).map((name, s) => ({
        id: s + 1,
        name,
        hold: rng.chance(0.2),
      })),
      takenAt: noonUtc(shiftDay(ANCHOR_DAY, -1)),
    };
  });

  // ---- Calendar: action items across offers, spread around the anchor ----
  const TASK_TITLES = [
    "Review closer call recordings",
    "Refresh the VSL hook",
    "Approve this week's ad creative",
    "1:1 with the setter team",
    "Rebuild the follow-up sequence",
    "Audit speed-to-lead",
    "Draft the monthly rev-share statement",
    "Update the offer's tracking sheet",
    "Onboard the new closer",
    "QA the application form",
    "Weekly pipeline review",
    "Send payout statements",
    "Tighten the booking reminders",
    "Plan next month's content",
  ];
  const TASK_STATUSES = ["not_started", "in_progress", "completed"];
  const actionItems: WithId<NewActionItem>[] = [];
  for (let i = 0; i < 40; i += 1) {
    const scheduled = rng.chance(0.82);
    const due = scheduled ? shiftDay(ANCHOR_DAY, rng.int(-8, 16)) : null;
    const status = rng.pick(TASK_STATUSES);
    const member = rng.chance(0.6) ? rng.pick(teamMembers) : null;
    const client = rng.chance(0.7) ? rng.pick(clients) : null;
    actionItems.push({
      id: rng.uuid(),
      title: rng.pick(TASK_TITLES),
      cadence: rng.pick(["daily", "weekly", "monthly"]),
      status,
      dueDate: due,
      assigneeId: member ? (member.id as string) : null,
      clientId: client ? (client.id as string) : null,
      notes: `${MARKER} task`,
      completedAt: status === "completed" ? noonUtc(due ?? ANCHOR_DAY) : null,
    });
  }

  return {
    profiles,
    clients,
    reps,
    teamMembers,
    deals,
    activityReports,
    eodTemplates,
    quotas,
    activityLogs,
    notifications,
    offerSettings,
    transactions,
    moneyEvents,
    revShareRules,
    integrations,
    kitSnapshots,
    actionItems,
  };
}
