import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
 * A rep's daily activity submission — the EOD, and its end-of-week and
 * beginning-of-day variants. These are SELF-REPORTED operational counts (dials,
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
    /** eod | eow | bod */
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
 * (or end-of-week / beginning-of-day) report. One per team + role + cadence.
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
    /** eod · eow · bod */
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
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("team_members_client_idx").on(table.clientId),
    index("team_members_role_idx").on(table.role),
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

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  client: one(clients, { fields: [teamMembers.clientId], references: [clients.id] }),
  actionItems: many(actionItems),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  assignee: one(teamMembers, {
    fields: [actionItems.assigneeId],
    references: [teamMembers.id],
  }),
  client: one(clients, { fields: [actionItems.clientId], references: [clients.id] }),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
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
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
