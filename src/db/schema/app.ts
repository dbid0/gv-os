import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * The `app` schema holds mutable operational state: people, clients, deals.
 * Normal CRUD lives here.
 *
 * Money does NOT live here. A deal records what was AGREED; the cash against it
 * lives as immutable events in the `ledger` schema. That separation is what
 * makes payment plans, partial collections, and accounts receivable fall out
 * naturally, instead of needing a "balance" column that can drift out of step
 * with what actually happened.
 */
export const appSchema = pgSchema("app");

/** One row per human who can use GV OS. `id` mirrors the Supabase Auth user id. */
export const profiles = appSchema.table("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A client brand: The Grid, The Vault, Racks Closes. */
export const clients = appSchema.table(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** URL-safe key, stable across renames. */
    slug: text("slug").notNull(),
    /** active | archived. Archived clients never count in a roster or a report. */
    status: text("status").notNull().default("active"),
    /** Where a row came from, so imported records are always identifiable. */
    externalRef: text("external_ref"),
    /** The client's Google Drive root folder — assets panel reads it live
     * through the sealed agency credential. Null until set on the client page. */
    driveFolderId: text("drive_folder_id"),
    /** Monthly cash target in integer cents; actuals come from the sheet
     * mirror. Null = no target set — the page shows an honest empty state. */
    monthlyTargetCents: bigint("monthly_target_cents", { mode: "number" }),
    /** Workspace logo as a small data URL — uploaded from the workspace
     * header; renders in the switcher, headers, and home sections. */
    logo: text("logo"),
    /** A short 3–8 word summary of what the offer is — the one line the
     * Clients roster card reads (who the creator is comes from the card's
     * own owner line). Editable inline on the card; null falls back to a
     * derived default so the card is never blank. */
    summary: text("summary"),
    /**
     * Which source owns this offer's CASH — the Money Spine anti-double-count
     * switch (MONEY-SPINE-SPEC §3). `auto` (default) = processors own the cash
     * when any processor source is connected, otherwise the new-deal form does;
     * `forms` / `processors` pin it explicitly. Multiple processors on one offer
     * all pool their cash regardless — this only decides whether the FORM also
     * contributes cash, so a deal is never counted twice.
     */
    cashAuthority: text("cash_authority").notNull().default("auto"),
    /** This offer's tracking-sheet id — the Google Sheet whose `🤝 New Deals`
     * tab feeds the new-deal importer. Null = not connected yet. */
    trackingSheetId: text("tracking_sheet_id"),

    /**
     * Team commission defaults, by role, in basis points. Applied to a deal
     * that has no explicit split — mirrors RepVision's team default rates. Null
     * means "no default for this role"; a deal without a split then goes
     * uncommissioned and is flagged, rather than paid a made-up rate.
     */
    defaultCloserBps: bigint("default_closer_bps", { mode: "number" }),
    defaultSetterBps: bigint("default_setter_bps", { mode: "number" }),
    defaultDmSetterBps: bigint("default_dm_setter_bps", { mode: "number" }),
    defaultManagerBps: bigint("default_manager_bps", { mode: "number" }),

    /**
     * Processor fees for this team's collections. When set, the fee is deducted
     * before commission, the same way the accounting side already models it.
     */
    deductProcessorFees: boolean("deduct_processor_fees").notNull().default(false),
    processorFeeBps: bigint("processor_fee_bps", { mode: "number" }),
    processorFeeFlatCents: bigint("processor_fee_flat_cents", { mode: "number" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clients_slug_key").on(table.slug)],
);

/**
 * A sales rep on a team. A team is a client brand, so a rep belongs to a
 * client — there is no separate `teams` table to drift out of step with the
 * roster we already keep.
 *
 * The comp columns hold a rep's STANDING terms. A per-deal override lives on
 * the commission split, and the dollar commission itself is never stored here —
 * it is derived from collected cash at rollup time, the same rule that keeps
 * the ledger honest.
 */
export const reps = appSchema.table(
  "reps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The team (client brand) this rep sells for. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** Set when the rep also signs in to GV OS. Null for a rep we only track. */
    profileId: uuid("profile_id").references(() => profiles.id),
    name: text("name").notNull(),
    /** closer · setter · dm_setter · manager · operator */
    role: text("role").notNull(),

    /** Default commission rate in basis points (1000 = 10%). Null = no default. */
    commissionBps: bigint("commission_bps", { mode: "number" }),
    /** Fixed base pay for a period, in cents. */
    basePayCents: bigint("base_pay_cents", { mode: "number" }),
    /** A manager's top-line skim across the team, in basis points. */
    topLineSkimBps: bigint("top_line_skim_bps", { mode: "number" }),

    /** active | inactive. Inactive reps drop off leaderboards and payout runs. */
    status: text("status").notNull().default("active"),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reps_client_idx").on(table.clientId),
    uniqueIndex("reps_external_ref_key").on(table.externalRef),
  ],
);

/**
 * An agreement. NOT a money event.
 *
 * `contractValueCents` is what was agreed, which is a fact about the deal.
 * What has actually been collected is derived from the ledger, never stored
 * here, so the two can never disagree.
 */
export const deals = appSchema.table(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),

    /** Setup · DFY Build · Rev-Share · Client Handoff · Other, and the newer ones. */
    dealType: text("deal_type").notNull(),
    offer: text("offer"),

    /** Total contract value in CENTS. Never a float, never dollars. */
    contractValueCents: bigint("contract_value_cents", { mode: "number" })
      .notNull()
      .default(0),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    agreementSigned: text("agreement_signed"),
    notes: text("notes"),

    /**
     * Sales attribution. A deal is closed BY a rep, comes FROM a source, and is
     * either one-time or recurring. These are facts about the sale; the rep's
     * pay is a separate commission split, and the cash is the ledger.
     */
    /** The rep who closed it. Null for pre-sales-module deals and imports. */
    repId: uuid("rep_id").references(() => reps.id),
    /** one_time | recurring — RepVision's deal "Type". */
    recurrence: text("recurrence"),
    /** How the deal came in: inbound · outbound · referral · paid_ads … */
    source: text("source"),
    /** The specific channel within the source. */
    leadSource: text("lead_source"),
    /** The end customer, for the deals ledger view. */
    customerName: text("customer_name"),

    /**
     * Stable key for the source row this came from. Makes import idempotent:
     * re-running the importer updates rather than duplicating.
     */
    externalRef: text("external_ref"),
    /** Which import batch created it, so one bad run can be reversed wholesale. */
    importBatchId: uuid("import_batch_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deals_external_ref_key").on(table.externalRef),
    index("deals_client_idx").on(table.clientId),
    index("deals_closed_at_idx").on(table.closedAt),
  ],
);

/**
 * Partner split rules, effective-dated.
 *
 * Splits are CONFIGURATION, not constants in code. The standing 50/50 and the
 * historical 45/55 and 30/70 overrides are all just rows, so a rule change is
 * data and history stays correct rather than being retroactively rewritten.
 *
 * Basis points: 5000 = 50%.
 */
export const partnerSplits = appSchema.table(
  "partner_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = the default rule. Set = an override for one client. */
    clientId: uuid("client_id").references(() => clients.id),
    /** Null = applies to every deal type. Set = only that type. */
    dealType: text("deal_type"),
    danielBps: bigint("daniel_bps", { mode: "number" }).notNull(),
    gusBps: bigint("gus_bps", { mode: "number" }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("partner_splits_client_idx").on(table.clientId)],
);

/**
 * One participant's cut of one deal. A deal can carry several: a closer, a
 * setter, a manager's skim. The RATE and ROLE live here; the dollar commission
 * is DERIVED from the deal's collected cash (or revenue) at rollup time, never
 * stored — the same rule that keeps a balance from drifting off the ledger.
 *
 * This is the rep-money layer, distinct from the partner (Daniel/Gus) split:
 * one deal, two split layers, on the same agreement.
 */
/**
 * An offer a client sells. Until now "offer" was free text on a deal, which made
 * per-offer compensation impossible to express: a $49/mo subscription, a $997
 * course and a $10K mastermind cannot share one commission model.
 *
 * Offers are a catalogue, not a ledger — editing one does not restate history,
 * because every deal snapshots its own rate at the time it is written.
 */
export const offers = appSchema.table(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    /** Stable machine key, unique per client: "operation-room", "mastermind". */
    slug: text("slug").notNull(),
    /** List price in cents. Informational — a deal records what was actually paid. */
    priceCents: bigint("price_cents", { mode: "number" }),
    /** subscription | one_time | high_ticket | other — shapes the sensible comp basis. */
    kind: text("kind").notNull().default("one_time"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("offers_client_idx").on(table.clientId),
    uniqueIndex("offers_client_slug_key").on(table.clientId, table.slug),
  ],
);

/**
 * How a role is paid ON ONE OFFER. The missing piece: `reps.commission_bps` is a
 * single rate per rep, so a rep selling two offers could only ever have one rate.
 *
 * Effective-dated and never edited in place — changing a rate writes a new row and
 * closes the old one, so a payout computed last month still recomputes to the same
 * number forever. Same discipline as `partner_splits`.
 *
 * Precedence, most specific first: rep override > offer default. Within that, the
 * row whose effective window contains the deal date wins.
 */
export const repCompRules = appSchema.table(
  "rep_comp_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id),
    /** closer · setter · dm_setter · manager */
    role: text("role").notNull(),
    /** Null = the default for this role on this offer. Set = an override for one rep. */
    repId: uuid("rep_id").references(() => reps.id),
    /** cash_collected | deal_revenue | per_booking | per_close | base */
    basis: text("basis").notNull(),
    /** For percentage bases. 1250 = 12.5%. */
    rateBps: bigint("rate_bps", { mode: "number" }),
    /** For per_booking / per_close / base. */
    flatCents: bigint("flat_cents", { mode: "number" }),
    /** Optional: rate steps up once the rep passes this much in a period. */
    tierThresholdCents: bigint("tier_threshold_cents", { mode: "number" }),
    tierRateBps: bigint("tier_rate_bps", { mode: "number" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    /** Null = still current. */
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rep_comp_rules_offer_idx").on(table.offerId),
    index("rep_comp_rules_rep_idx").on(table.repId),
  ],
);

export const commissionSplits = appSchema.table(
  "commission_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id),
    repId: uuid("rep_id")
      .notNull()
      .references(() => reps.id),
    /** closer · setter · dm_setter · manager */
    role: text("role").notNull(),
    /** This participant's rate on this deal, in basis points. */
    rateBps: bigint("rate_bps", { mode: "number" }).notNull(),
    /** cash_collected | deal_revenue — what the rate is applied to. */
    basis: text("basis").notNull().default("cash_collected"),
    /** A one-off bonus for this participant on this deal, in cents. */
    bonusCents: bigint("bonus_cents", { mode: "number" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commission_splits_deal_idx").on(table.dealId),
    index("commission_splits_rep_idx").on(table.repId),
  ],
);

/**
 * A rep's daily activity submission — the EOD and its beginning-of-day
 * variant (GV runs no end-of-week form). These are SELF-REPORTED operational counts (dials,
 * shows, appointments set), not money. Any cash figure a rep types here is
 * their own number and stays inside `metrics`, deliberately walled off from the
 * ledger, which remains the only source of truth for money.
 */
export const activityReports = appSchema.table(
  "activity_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repId: uuid("rep_id")
      .notNull()
      .references(() => reps.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** The day this report covers. */
    reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
    /** eod | bod */
    kind: text("kind").notNull().default("eod"),
    /** The activity bundle: { dials, contacts, appts_set, shows, pitched, … }. */
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    notes: text("notes"),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_reports_rep_idx").on(table.repId),
    index("activity_reports_date_idx").on(table.reportDate),
    uniqueIndex("activity_reports_external_ref_key").on(table.externalRef),
  ],
);

/** A team-specific extra question on an EOD form. */
export type EodCustomField = {
  /** Stable key stored in an activity_reports metrics bundle. */
  key: string;
  label: string;
  type: "number" | "currency" | "text";
  /** Surface this field as a dashboard metric tile. */
  showOnDashboard?: boolean;
};

/**
 * A derived metric computed from other fields, e.g. show rate. Kept as a simple
 * numerator ÷ denominator over field keys, which is exactly the vocabulary
 * RepVision's template builder exposes ("Rate: numerator ÷ denominator").
 */
export type EodCalcField = {
  key: string;
  label: string;
  format: "number" | "percent" | "currency";
  numerator: string;
  denominator: string;
  showOnDashboard?: boolean;
};

/**
 * An EOD template: the fields a rep of a given role fills out on their daily
 * (or beginning-of-day) report. One per team + role + cadence.
 *
 * This ONE object drives three surfaces — the Submit-EOD form, the leaderboard
 * columns, and the dashboard metric tiles — so a field turned on here shows up
 * everywhere it should. That single-source wiring is the heart of RepVision.
 *
 * Fields are DATA, not columns, so a team can shape its own form without a
 * migration:
 *  - `baseFields`  — keys from the fixed activity vocabulary that are turned on
 *    (dials · connects · dms_sent · sets_booked · calls_taken · shows ·
 *     no_shows · cancelled_calls · follow_up_calls).
 *  - `customFields` — team-specific extra questions.
 *  - `calcFields`   — derived metrics computed from the others.
 */
export const eodTemplates = appSchema.table(
  "eod_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** closer · setter · dm_setter · manager */
    role: text("role").notNull(),
    /** eod · bod */
    cadence: text("cadence").notNull().default("eod"),
    name: text("name").notNull(),
    baseFields: jsonb("base_fields").$type<string[]>().notNull().default([]),
    customFields: jsonb("custom_fields")
      .$type<EodCustomField[]>()
      .notNull()
      .default([]),
    calcFields: jsonb("calc_fields").$type<EodCalcField[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("eod_templates_client_idx").on(table.clientId),
    uniqueIndex("eod_templates_external_ref_key").on(table.externalRef),
  ],
);

/**
 * A quota: a monthly target for one rep OR one team, on one metric.
 *
 * Quotas are CONFIGURATION — a goal to pace against, exactly like RepVision's
 * per-rep and per-team quota assignment. They never hold money and never write a
 * ledger event. The actual-so-far is DERIVED at read time from data that already
 * exists (collected cash in the ledger, closed deals, EOD activity), so a quota
 * can never drift from the numbers it is measured against.
 *
 * `targetAmount` is integer CENTS for a money metric (cash collected) and a
 * whole count for everything else (deals, dials, shows). Never a float.
 */
export const quotas = appSchema.table(
  "quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** rep | team — who the quota is assigned to. */
    scope: text("scope").notNull(),
    /** Set when scope = rep. Null for a team quota. */
    repId: uuid("rep_id").references(() => reps.id),
    /** The team (client brand). Always set — a rep quota also records the team. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** A key from the quota metric vocabulary: cash_collected · deals · dials … */
    metric: text("metric").notNull(),
    /** The target: integer CENTS for money, a whole count otherwise. */
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    /** The month this quota covers, as YYYY-MM. */
    period: text("period").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("quotas_client_idx").on(table.clientId),
    index("quotas_rep_idx").on(table.repId),
    index("quotas_period_idx").on(table.period),
  ],
);

/**
 * Org-level settings, as a single JSON row.
 *
 * A key/value blob rather than a wide column list, so a new preference (a goal,
 * a toggle, a display option) is a code change, not a migration. Goals are
 * TARGETS, not ledger money — they live here, never in the money tables.
 */
export const settings = appSchema.table("settings", {
  id: text("id").primaryKey().default("org"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The agency team roster: copywriters, VAs, creative directors, and the rest of
 * the crew who run out of GV OS. Distinct from sales `reps` — a rep is comped on
 * a client's deals; a team member is who work gets ASSIGNED to. The two unify
 * later if that distinction stops earning its keep.
 *
 * `client_id` scopes a member to one client's lane (the trial copywriter works
 * Grid + Vault only, etc.); null = agency-wide. Role-based views hang off this
 * table: a member's board is their assigned action items filtered to their
 * scope.
 */
export const teamMembers = appSchema.table(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** copywriter · va · creative_director · setter · closer · manager · operator */
    role: text("role").notNull(),
    /** Set when the member signs in to GV OS. Null for someone we only assign. */
    email: text("email"),
    /** Null = agency-wide; set = this member works one client's lane. */
    clientId: uuid("client_id").references(() => clients.id),
    /** active | inactive. Inactive members keep history but leave the pickers. */
    status: text("status").notNull().default("active"),
    /** Platform role (v2 §6): admin · sales_manager · sales_rep · team_member.
     * Null = not yet mapped; job title stays in `role`. */
    roleKey: text("role_key"),
    /** setter | closer | dm_setter — only meaningful when roleKey = sales_rep. */
    repKind: text("rep_kind"),
    /**
     * The sales `reps` row this member IS, when they sell on a team. This is the
     * backbone link: with it, a member's profile resolves their quotas, momentum
     * (streak/PBs), and commission owed from the read layers that already key off
     * reps. Null for non-sales members — their profile is the identity card only.
     */
    repId: uuid("rep_id").references(() => reps.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("team_members_client_idx").on(table.clientId),
    index("team_members_role_idx").on(table.role),
    index("team_members_rep_idx").on(table.repId),
  ],
);

/**
 * A connected external tool: Close, Calendly, Kit, Stripe, an MCP server…
 *
 * The credential is stored ONLY as AES-256-GCM ciphertext (see
 * src/lib/crypto/secretbox.ts); `secret_hint` ("…a1b2") is all the UI ever
 * gets back. `client_id` scopes a connection to one client — per-client
 * credential isolation is a standing rule — and null = the agency's own
 * connection. Sync jobs record health on `last_sync_*` so the Integrations
 * page can show what's live and what's stale.
 */
export const integrations = appSchema.table(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Catalog value from src/lib/integrations/providers.ts. */
    provider: text("provider").notNull(),
    /** Human label: "Grid Close account", "Vault Kit". */
    label: text("label").notNull(),
    /** Null = agency-wide; set = this client's own connection. */
    clientId: uuid("client_id").references(() => clients.id),
    /** Sealed credential (v1.<iv>.<tag>.<ct>). Null once revoked. */
    secretBox: text("secret_box"),
    /** Displayable tail of the secret. Never the secret itself. */
    secretHint: text("secret_hint"),
    /** Non-secret provider settings (account ids, list ids, base URLs). */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** connected · error · revoked */
    status: text("status").notNull().default("connected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncNote: text("last_sync_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("integrations_provider_idx").on(table.provider),
    index("integrations_client_idx").on(table.clientId),
  ],
);

/**
 * Captured payment events — the staging layer between processors and the
 * ledger. A webhook or API pull lands here first, deduped forever on
 * (provider, external_id). NOTHING here touches `ledger.money_events`
 * automatically: posting to the append-only ledger is a deliberate action
 * once the event is attributed to a deal. That separation is what lets us
 * capture aggressively without ever corrupting the numbers.
 */
export const paymentEvents = appSchema.table(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    provider: text("provider").notNull(),
    /** The processor's own event/transaction id — the idempotency key. */
    externalId: text("external_id").notNull(),
    /** Scope inherited from the connection. Null = agency. */
    clientId: uuid("client_id").references(() => clients.id),
    /** charge · refund · unknown */
    kind: text("kind").notNull().default("unknown"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    email: text("email"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    /** What the processor called it, for display. */
    label: text("label"),
    /** captured · posted · ignored */
    status: text("status").notNull().default("captured"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_events_provider_external_key").on(
      table.provider,
      table.externalId,
    ),
    index("payment_events_client_idx").on(table.clientId),
    index("payment_events_integration_idx").on(table.integrationId),
  ],
);

/**
 * Captured CRM activity — rep dials, texts, and emails pulled from Close per
 * client connection. Same staging discipline as payment_events: idempotent on
 * the source's own id, raw kept, views aggregate. Self-reported EODs live in
 * activity_reports; this table is what the CRM actually recorded — the two
 * get compared, not merged.
 */
export const crmActivity = appSchema.table(
  "crm_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    provider: text("provider").notNull().default("close"),
    /** The CRM's own activity id — the idempotency key. */
    externalId: text("external_id").notNull(),
    /** Scope inherited from the connection. Null = agency. */
    clientId: uuid("client_id").references(() => clients.id),
    /** call · sms · email */
    kind: text("kind").notNull(),
    userId: text("user_id"),
    userName: text("user_name"),
    direction: text("direction"),
    durationSeconds: bigint("duration_seconds", { mode: "number" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    leadId: text("lead_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_activity_provider_external_key").on(
      table.provider,
      table.externalId,
    ),
    index("crm_activity_client_idx").on(table.clientId),
    index("crm_activity_occurred_idx").on(table.occurredAt),
  ],
);

/**
 * Captured bookings — calls scheduled through Calendly, iClosed, or anything
 * that can push a webhook. Same staging discipline as payments/CRM capture:
 * idempotent on (provider, external_id), scope inherited from the connection,
 * raw kept. Speed-to-lead measurement joins these against applications later.
 */
export const bookings = appSchema.table(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    provider: text("provider").notNull(),
    /** The scheduler's own event/booking id — the idempotency key. */
    externalId: text("external_id").notNull(),
    /** Scope inherited from the connection. Null = agency. */
    clientId: uuid("client_id").references(() => clients.id),
    eventType: text("event_type"),
    inviteeName: text("invitee_name"),
    inviteeEmail: text("invitee_email"),
    /** booked · canceled · unknown */
    status: text("status").notNull().default("booked"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bookings_provider_external_key").on(table.provider, table.externalId),
    index("bookings_client_idx").on(table.clientId),
    index("bookings_starts_idx").on(table.startsAt),
  ],
);

/**
 * Captured signed documents — agreements PandaDoc reports as completed,
 * polled per client connection. The signed-agreement notification stream and,
 * later, the deal-attachment source. Same staging discipline as every capture.
 */
export const signedDocs = appSchema.table(
  "signed_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    provider: text("provider").notNull().default("pandadoc"),
    /** The e-sign platform's own document id — the idempotency key. */
    externalId: text("external_id").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    name: text("name"),
    docStatus: text("doc_status"),
    recipientEmail: text("recipient_email"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("signed_docs_provider_external_key").on(
      table.provider,
      table.externalId,
    ),
    index("signed_docs_client_idx").on(table.clientId),
  ],
);

/**
 * Captured funnel applications — Typeform responses per client connection.
 * Applications-in per offer, day over day; joins against bookings later for
 * speed-to-lead. Answers stay in raw; only the join keys are lifted out.
 */
export const applications = appSchema.table(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    provider: text("provider").notNull().default("typeform"),
    /** The form platform's response id — the idempotency key. */
    externalId: text("external_id").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    formId: text("form_id"),
    formName: text("form_name"),
    email: text("email"),
    name: text("name"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("applications_provider_external_key").on(
      table.provider,
      table.externalId,
    ),
    index("applications_client_idx").on(table.clientId),
    index("applications_submitted_idx").on(table.submittedAt),
  ],
);

/**
 * Kit (email) account snapshots — one row per sync per connection. Email
 * stats are STATE, not events, so the capture is a periodic snapshot; the
 * Email section charts growth by comparing snapshots over time. Raw sequence
 * list kept so later views can drill without re-pulling.
 */
export const kitSnapshots = appSchema.table(
  "kit_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    /** Scope inherited from the connection. Null = agency. */
    clientId: uuid("client_id").references(() => clients.id),
    accountName: text("account_name"),
    plan: text("plan"),
    sequenceCount: bigint("sequence_count", { mode: "number" }).notNull().default(0),
    tagCount: bigint("tag_count", { mode: "number" }).notNull().default(0),
    /** Whole-list size at snapshot time. Null on rows captured before this
     * column existed — never backfilled with a fake zero. */
    subscriberCount: bigint("subscriber_count", { mode: "number" }),
    sequences: jsonb("sequences")
      .$type<{ id: number; name: string; hold?: boolean }[]>()
      .notNull()
      .default([]),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kit_snapshots_integration_idx").on(table.integrationId)],
);

/**
 * One run of the Master Finance Sheet mirror (Accounting Phase A). The sheet
 * stays the system of record; each run snapshots what it said and what our
 * engine recomputed. Runs are kept as history — the reconciliation screen
 * reads the latest.
 */
export const sheetSyncRuns = appSchema.table("sheet_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** ok · error */
  status: text("status").notNull().default("ok"),
  note: text("note"),
  rowCount: bigint("row_count", { mode: "number" }).notNull().default(0),
  driftRowCount: bigint("drift_row_count", { mode: "number" }).notNull().default(0),
  totalAbsDriftCents: bigint("total_abs_drift_cents", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One mirrored deal row from a sync run: the sheet's inputs, the sheet's own
 * computed figures, our recomputed figures, and the per-figure drift. NOT the
 * ledger — a replaceable mirror used for verification, per ACCOUNTING-DESIGN
 * Phase A. Real client names and dollars live only in the database, never in
 * the repo.
 */
export const sheetMirrorDeals = appSchema.table(
  "sheet_mirror_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => sheetSyncRuns.id),
    rowIndex: bigint("row_index", { mode: "number" }).notNull(),
    dateClosed: text("date_closed").notNull(),
    client: text("client").notNull(),
    dealType: text("deal_type").notNull(),
    offer: text("offer"),
    method: text("method").notNull(),
    payoutStatus: text("payout_status"),
    revenueCents: bigint("revenue_cents", { mode: "number" }).notNull(),
    cashCents: bigint("cash_cents", { mode: "number" }).notNull(),
    /** ours = the GV OS engine · sheet = the sheet's own figures, in cents. */
    figures: jsonb("figures")
      .$type<{
        ours: Record<string, number>;
        sheet: Record<string, number>;
        driftCents: Record<string, number>;
      }>()
      .notNull(),
    hasDrift: boolean("has_drift").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sheet_mirror_deals_run_idx").on(table.runId)],
);

/**
 * The action list: the daily/weekly/monthly task board the whole team runs on.
 *
 * A `client_id` of null means the item belongs to the AGENCY scope (Daniel +
 * Gus), keeping client work walled from agency work. `assignee_id` points at
 * the team roster; the legacy free-text `assignee` stays readable on old rows
 * but new items assign real members. Later the Discord bot syncs status both
 * ways against these rows.
 */
export const actionItems = appSchema.table(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** daily · weekly · monthly */
    cadence: text("cadence").notNull().default("daily"),
    /** not_started · in_progress · completed */
    status: text("status").notNull().default("not_started"),
    dueDate: date("due_date", { mode: "string" }),
    /** Legacy free-text name from before the Team module. Superseded below. */
    assignee: text("assignee"),
    /** Who this action belongs to, from the team roster. */
    assigneeId: uuid("assignee_id").references(() => teamMembers.id),
    /** Null = agency scope (Daniel + Gus); set = this client's board. */
    clientId: uuid("client_id").references(() => clients.id),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("action_items_cadence_idx").on(table.cadence),
    index("action_items_client_idx").on(table.clientId),
    index("action_items_assignee_idx").on(table.assigneeId),
  ],
);

/**
 * One recorded call — the agency morning call or an ad-hoc client call. Written
 * by the cloud notetaker (a GitHub Action that joins the Discord voice channel,
 * transcribes with whisper, and distills with Claude Code), never by hand. The
 * distilled action items become `action_items` rows at ingest time, so they
 * flow straight onto the Work board and Calendar; this table is the permanent
 * recap + verbatim transcript home. `sourceRef` is the recorder's session
 * stamp, unique so a re-post of the same call updates in place rather than
 * duplicating.
 */
export const meetingNotes = appSchema.table(
  "meeting_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** agency_call · client_call · manual */
    source: text("source").notNull().default("agency_call"),
    /** The recorder's session id (dir stamp). Unique => idempotent re-ingest. */
    sourceRef: text("source_ref"),
    meetingDate: date("meeting_date", { mode: "string" }).notNull(),
    summary: text("summary"),
    transcript: text("transcript"),
    /** Display names captured in the room, in speaking order. */
    attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
    /**
     * The distilled action items as the call assigned them, for the immutable
     * recap. Live, mutable copies also land in `action_items` (the Work board)
     * at ingest — this jsonb is the "what this call decided" record so the
     * meeting detail never depends on later task edits.
     */
    actionItems: jsonb("action_items")
      .$type<{ person: string; tasks: string[] }[]>()
      .notNull()
      .default([]),
    /** Google Doc (full notes + verbatim transcript), when the upload succeeds. */
    docLink: text("doc_link"),
    /** Set when the call was scoped to one client (an ad-hoc client call). */
    clientId: uuid("client_id").references(() => clients.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meeting_notes_source_ref_idx").on(table.sourceRef),
    index("meeting_notes_date_idx").on(table.meetingDate),
    index("meeting_notes_client_idx").on(table.clientId),
  ],
);

export const clientsRelations = relations(clients, ({ many }) => ({
  deals: many(deals),
  reps: many(reps),
  eodTemplates: many(eodTemplates),
}));

export const eodTemplatesRelations = relations(eodTemplates, ({ one }) => ({
  client: one(clients, { fields: [eodTemplates.clientId], references: [clients.id] }),
}));

export const repsRelations = relations(reps, ({ one, many }) => ({
  client: one(clients, { fields: [reps.clientId], references: [clients.id] }),
  profile: one(profiles, { fields: [reps.profileId], references: [profiles.id] }),
  deals: many(deals),
  commissionSplits: many(commissionSplits),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  client: one(clients, { fields: [deals.clientId], references: [clients.id] }),
  rep: one(reps, { fields: [deals.repId], references: [reps.id] }),
  commissionSplits: many(commissionSplits),
}));

export const commissionSplitsRelations = relations(commissionSplits, ({ one }) => ({
  deal: one(deals, { fields: [commissionSplits.dealId], references: [deals.id] }),
  rep: one(reps, { fields: [commissionSplits.repId], references: [reps.id] }),
}));

export const activityReportsRelations = relations(activityReports, ({ one }) => ({
  rep: one(reps, { fields: [activityReports.repId], references: [reps.id] }),
  client: one(clients, {
    fields: [activityReports.clientId],
    references: [clients.id],
  }),
}));

export const quotasRelations = relations(quotas, ({ one }) => ({
  team: one(clients, { fields: [quotas.clientId], references: [clients.id] }),
  rep: one(reps, { fields: [quotas.repId], references: [reps.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  client: one(clients, { fields: [teamMembers.clientId], references: [clients.id] }),
  rep: one(reps, { fields: [teamMembers.repId], references: [reps.id] }),
  actionItems: many(actionItems),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  assignee: one(teamMembers, {
    fields: [actionItems.assigneeId],
    references: [teamMembers.id],
  }),
  client: one(clients, { fields: [actionItems.clientId], references: [clients.id] }),
}));

export const meetingNotesRelations = relations(meetingNotes, ({ one }) => ({
  client: one(clients, { fields: [meetingNotes.clientId], references: [clients.id] }),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
export type RepCompRule = typeof repCompRules.$inferSelect;
export type NewRepCompRule = typeof repCompRules.$inferInsert;
export type PartnerSplit = typeof partnerSplits.$inferSelect;
export type NewPartnerSplit = typeof partnerSplits.$inferInsert;
export type Rep = typeof reps.$inferSelect;
export type NewRep = typeof reps.$inferInsert;
export type CommissionSplit = typeof commissionSplits.$inferSelect;
export type NewCommissionSplit = typeof commissionSplits.$inferInsert;
export type ActivityReport = typeof activityReports.$inferSelect;
export type NewActivityReport = typeof activityReports.$inferInsert;
export type EodTemplate = typeof eodTemplates.$inferSelect;
export type NewEodTemplate = typeof eodTemplates.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;
export type NewActionItem = typeof actionItems.$inferInsert;
export type MeetingNote = typeof meetingNotes.$inferSelect;
export type NewMeetingNote = typeof meetingNotes.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;

/**
 * Per-user persisted UI preferences (v2 Phase 0): homepage big-number mode,
 * saved filters — anything that should survive a sign-out. Keyed by email
 * because that IS the identity under magic-link auth. Values are jsonb so a
 * pref can be a string, a flag, or a small object without a migration.
 */
export const userPrefs = appSchema.table(
  "user_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userEmail: text("user_email").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_prefs_user_key").on(table.userEmail, table.key)],
);

export type UserPref = typeof userPrefs.$inferSelect;

/**
 * v2 unified transactions backlog (spec §2.1) — THE source of truth for every
 * dollar in or out, both layers. Every dashboard is a filtered read of this
 * table; nothing is ever entered twice. Append-only (SQL triggers in the
 * migration): corrections are reversing rows, never edits. `occurred_on` is
 * the literal CT business day (yyyy-mm-dd) all bucketing keys off;
 * `occurred_at` carries a precise timestamp when the source has one.
 */
export const transactions = appSchema.table(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredOn: text("occurred_on").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /** in = money toward GV/client · out = money leaving. */
    direction: text("direction").notNull(),
    /** agency = GV's own book · client = an offer's book. */
    layer: text("layer").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    /** Setup · DWY Build · DFY Build · Retainer · Rev-Share · Client Handoff · Other. */
    dealType: text("deal_type"),
    offer: text("offer"),
    description: text("description"),
    paymentMethod: text("payment_method"),
    revenueCents: bigint("revenue_cents", { mode: "number" }).notNull().default(0),
    cashCents: bigint("cash_cents", { mode: "number" }).notNull().default(0),
    processorFeeCents: bigint("processor_fee_cents", { mode: "number" })
      .notNull()
      .default(0),
    agreementSigned: boolean("agreement_signed"),
    leadEmail: text("lead_email"),
    /** True = money not tied to a tracked sale (mutes the missing-form alert). */
    external: boolean("external").notNull().default(false),
    /** form · processor · manual · sheet. */
    source: text("source").notNull(),
    /** Replay-proof identity: processor event id, sheet content key, form id. */
    idempotencyKey: text("idempotency_key").notNull(),
    enteredBy: text("entered_by"),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("transactions_idempotency_key").on(table.idempotencyKey),
    index("transactions_layer_idx").on(table.layer),
    index("transactions_client_idx").on(table.clientId),
    index("transactions_occurred_on_idx").on(table.occurredOn),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

/**
 * Rev-share rules (v2 §4): effective-dated, after processing fees. The rate
 * that applies to a month is the newest rule effective on or before it —
 * rates change by APPENDING a new rule, never editing history. Rep
 * commissions are excluded from rev-share by design.
 */
export const revShareRules = appSchema.table(
  "rev_share_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    rateBps: bigint("rate_bps", { mode: "number" }).notNull(),
    /** yyyy-mm-dd — applies from this business day forward. */
    effectiveFrom: text("effective_from").notNull(),
    /** When true, the rate applies to cash-after-fees MINUS that month's ad
     * spend, not to cash-after-fees itself (Racks = 10% after ad spend). */
    deductAdSpend: boolean("deduct_ad_spend").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rev_share_rules_client_idx").on(table.clientId)],
);

export type RevShareRule = typeof revShareRules.$inferSelect;

/**
 * Payout tracker (v2 §4): month-scoped workflow state. The TRACKER is
 * mutable (status flips Pending → Paid); the MONEY is not — marking paid
 * writes the matching backlog transaction (idempotent on the payout id),
 * and that row is the truth. 50/50 partner split lives here and only here.
 */
export const payouts = appSchema.table(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** yyyy-mm. */
    month: text("month").notNull(),
    /** partner · rep_share · retainer · processor · ad_spend · revshare_received · other. */
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    baseCents: bigint("base_cents", { mode: "number" }).notNull(),
    /** pending · paid. One-way: corrections are reversing backlog rows. */
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payouts_month_idx").on(table.month)],
);

/** Flexible line items on a payout (discounts, extras); deltas may be negative. */
export const payoutAdjustments = appSchema.table(
  "payout_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id),
    label: text("label").notNull(),
    deltaCents: bigint("delta_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payout_adjustments_payout_idx").on(table.payoutId)],
);

export type Payout = typeof payouts.$inferSelect;
export type PayoutAdjustment = typeof payoutAdjustments.$inferSelect;

/**
 * Agency expense tracker (v2 §2.6): GV's own software/tools/spend. The row
 * is metadata; the MONEY is the backlog out-row written on entry
 * (idempotent on the expense id) — one source of truth, and the agency
 * chain's "other out" leg picks it up automatically.
 */
export const agencyExpenses = appSchema.table(
  "agency_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** yyyy-mm-dd the expense hit. */
    occurredOn: text("occurred_on").notNull(),
    label: text("label").notNull(),
    /** software · tools · contractors · ads · other. */
    category: text("category").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agency_expenses_occurred_idx").on(table.occurredOn)],
);

export type AgencyExpense = typeof agencyExpenses.$inferSelect;

/**
 * Per-offer ad spend — the cost an offer's own ads carry, deducted from its
 * cash-after-fees BEFORE a "X% after ad spend" rev-share is rated (Racks =
 * 10% after ad spend). Append-only: a correction is a new (possibly negative)
 * row, never an edit, so the rev-share basis is always replayable.
 */
export const clientAdSpend = appSchema.table(
  "client_ad_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** yyyy-mm-dd the spend is attributed to (bucketed by month for rev-share). */
    occurredOn: text("occurred_on").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    note: text("note"),
    enteredBy: text("entered_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("client_ad_spend_client_idx").on(table.clientId)],
);

export type ClientAdSpend = typeof clientAdSpend.$inferSelect;

/**
 * GV's OWN sales pipeline — the agency's prospects (creators it's selling into)
 * from lead to signed. This is CRM/forecast, deliberately SEPARATE from the
 * money ledger: no transactions, no rev-share rows come from here. A won deal
 * becomes a real client through onboarding, not by a ledger side effect.
 */
export const pipelineProspects = appSchema.table(
  "pipeline_prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** IG/social handle. */
    handle: text("handle"),
    niche: text("niche"),
    followers: bigint("followers", { mode: "number" }),
    /** lead · contacted · call_booked · proposal · won · lost. */
    stage: text("stage").notNull().default("lead"),
    /** Proposed setup fee, integer cents. */
    setupFeeCents: bigint("setup_fee_cents", { mode: "number" }).notNull().default(0),
    /** Proposed monthly rev-share rate, basis points. */
    revShareBps: bigint("rev_share_bps", { mode: "number" }).notNull().default(0),
    /** Estimated monthly offer revenue, integer cents (the rev-share base). */
    estMonthlyRevCents: bigint("est_monthly_rev_cents", { mode: "number" })
      .notNull()
      .default(0),
    note: text("note"),
    ownerName: text("owner_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pipeline_prospects_stage_idx").on(table.stage)],
);

export type PipelineProspect = typeof pipelineProspects.$inferSelect;

/**
 * Notifications (v2 §5). Rules compute candidates from captured state; the
 * unique dedupe key makes every rule idempotent — re-evaluating never
 * duplicates an alert. readAt is the only mutable field.
 */
export const notifications = appSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sync_failure · integration_stale · sheet_drift · agreement_signed · agreement_missing · … */
    kind: text("kind").notNull(),
    /** info · warning · critical — semantic colors carry these. */
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    clientId: uuid("client_id").references(() => clients.id),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key").on(table.dedupeKey),
    index("notifications_read_idx").on(table.readAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;

/**
 * Per-offer settings (v2 §2.9): alert times, celebration threshold, and
 * client-visibility toggles. One row per client, created on first edit.
 */
export const offerSettings = appSchema.table(
  "offer_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    timezone: text("timezone").notNull().default("America/Chicago"),
    /** HH:MM 24h local to the offer's timezone. Null = alert off. */
    eodAlertTime: text("eod_alert_time"),
    bodAlertTime: text("bod_alert_time").default("12:00"),
    /** Confetti only above this. Default $5k. */
    confettiThresholdCents: bigint("confetti_threshold_cents", { mode: "number" })
      .notNull()
      .default(500_000),
    /** Client-portal visibility toggles (Phase 6 reads these). */
    visibility: jsonb("visibility")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("offer_settings_client_key").on(table.clientId)],
);

export type OfferSettings = typeof offerSettings.$inferSelect;

/**
 * A logged call or booking — RepVision's Call Library / Log Activity, as rows.
 *
 * A rep logs every call after it happens (or a setter logs a booking they set),
 * tagging the outcome as a disposition. These are SELF-REPORTED activity, not
 * money: nothing here ever writes a ledger event. The rows are queryable so they
 * can feed rep activity metrics — the disposition→metric mapping and the
 * aggregation live in the pure, fully covered src/lib/sales/call-activity.ts.
 *
 * `externalRef` is the stable key for a future Fathom auto-import: re-running an
 * import updates rather than duplicating. That importer is a stub behind the
 * go-live wall today — no row here is ever invented.
 */
export const activityLogs = appSchema.table(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** call | booking — RepVision's "Log a Call" vs "Log a Booking". */
    mode: text("mode").notNull().default("call"),
    /** The team (client brand) this activity belongs to. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** The rep the activity is assigned to. Null = logged but unassigned. */
    repId: uuid("rep_id").references(() => reps.id),
    /** discovery | close | follow_up */
    callType: text("call_type"),
    /**
     * The outcome tag: sale_closed · follow_up_booked · not_interested ·
     * no_show · dq · wrong_number · bad_lead · rescheduled. Vocabulary and the
     * metric mapping live in src/lib/sales/call-activity.ts.
     */
    disposition: text("disposition").notNull(),
    /** The call recording (Fathom / Zoom / etc.). */
    recordingUrl: text("recording_url"),
    /** The lead URL / CRM link (Close, etc.). */
    leadUrl: text("lead_url"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    notes: text("notes"),
    /** When the call or booking actually happened. Defaults to now. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** manual | fathom — where the log came from. Fathom import is a stub. */
    source: text("source").notNull().default("manual"),
    /** Stable key for import idempotency (a Fathom recording id). */
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_logs_client_idx").on(table.clientId),
    index("activity_logs_rep_idx").on(table.repId),
    index("activity_logs_disposition_idx").on(table.disposition),
    index("activity_logs_occurred_at_idx").on(table.occurredAt),
    uniqueIndex("activity_logs_external_ref_key").on(table.externalRef),
  ],
);

export type ActivityLog = typeof activityLogs.$inferSelect;

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  client: one(clients, { fields: [activityLogs.clientId], references: [clients.id] }),
  rep: one(reps, { fields: [activityLogs.repId], references: [reps.id] }),
}));

/**
 * The AI assistant transcript. One row per message — a user turn or the
 * assistant's reply — so a conversation can be replayed and audited.
 *
 * Additive and append-only in spirit: rows are inserted, never mutated. It
 * records the FACE the question was asked under (admin | sales_manager |
 * sales_rep — the scope), which starter/tool question a turn resolved to, and,
 * for assistant turns, the tools invoked plus their structured result payload.
 * It never stores money — only references to what was read — so it sits safely
 * in the mutable `app` schema alongside the rest of operational state.
 */
export const aiConversations = appSchema.table(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Who was asking. Null when there is no signed-in profile (dev/preview). */
    profileId: uuid("profile_id").references(() => profiles.id),
    /** The assistant face / scope: admin | sales_manager | sales_rep. */
    face: text("face").notNull(),
    /** Message author: user | assistant. */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** The starter/tool question this turn resolved to, when any. */
    questionId: text("question_id"),
    /** Tools the assistant invoked this turn: [{ toolId, capability }]. */
    toolCalls: jsonb("tool_calls").$type<{ toolId: string; capability: string }[]>(),
    /** The structured result payload the tools returned, for replay/audit. */
    toolResults: jsonb("tool_results").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_conversations_profile_idx").on(table.profileId, table.createdAt),
    index("ai_conversations_face_idx").on(table.face),
    index("ai_conversations_created_idx").on(table.createdAt),
  ],
);

export type AiConversation = typeof aiConversations.$inferSelect;

export const aiConversationsRelations = relations(aiConversations, ({ one }) => ({
  profile: one(profiles, {
    fields: [aiConversations.profileId],
    references: [profiles.id],
  }),
}));

/**
 * The Workspace: a Notion-style docs/wiki that lives inside GV OS.
 *
 * A page is markdown, not a block tree — the body is a single `content` string,
 * deliberately, so a page is a portable document Daniel can paste in or copy
 * out, never a proprietary format that traps his writing.
 *
 * A page belongs to a TEAMSPACE via `clientId`: a client's teamspace when set,
 * or the "Global Ventures" agency teamspace when null. Teamspaces are DERIVED
 * from the roster (active clients + the agency), never their own table, so the
 * two can't drift. Nesting is a self-reference on `parentId`: null = top-level
 * in its teamspace. `sortOrder` is the manual order among siblings; ties break
 * on title then id so a tree is always stable.
 */
export const workspacePages = appSchema.table(
  "workspace_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The teamspace. Null = the Global Ventures agency teamspace. */
    clientId: uuid("client_id").references(() => clients.id),
    /** Parent page for nesting. Null = top-level in the teamspace. */
    parentId: uuid("parent_id").references((): AnyPgColumn => workspacePages.id),
    title: text("title").notNull().default("Untitled"),
    /** A single emoji used as the page icon, e.g. "📄". */
    icon: text("icon"),
    /** The markdown body. Null until the page is written. */
    content: text("content"),
    /** Manual order among siblings; lower sorts first. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_pages_client_idx").on(table.clientId),
    index("workspace_pages_parent_idx").on(table.parentId),
  ],
);

export const workspacePagesRelations = relations(workspacePages, ({ one, many }) => ({
  client: one(clients, {
    fields: [workspacePages.clientId],
    references: [clients.id],
  }),
  parent: one(workspacePages, {
    fields: [workspacePages.parentId],
    references: [workspacePages.id],
    relationName: "workspace_page_children",
  }),
  children: many(workspacePages, { relationName: "workspace_page_children" }),
}));

export type WorkspacePage = typeof workspacePages.$inferSelect;
export type NewWorkspacePage = typeof workspacePages.$inferInsert;
