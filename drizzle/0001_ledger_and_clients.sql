CREATE TABLE "app"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"deal_type" text NOT NULL,
	"offer" text,
	"contract_value_cents" bigint DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"agreement_signed" text,
	"notes" text,
	"external_ref" text,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."partner_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"deal_type" text,
	"daniel_bps" bigint NOT NULL,
	"gus_bps" bigint NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."money_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"client_id" uuid,
	"deal_id" uuid,
	"processor" text,
	"actor_id" uuid,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reverses_id" uuid,
	"import_batch_id" uuid,
	"memo" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."deals" ADD CONSTRAINT "deals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."partner_splits" ADD CONSTRAINT "partner_splits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."money_events" ADD CONSTRAINT "money_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."money_events" ADD CONSTRAINT "money_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "app"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."money_events" ADD CONSTRAINT "money_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_slug_key" ON "app"."clients" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_external_ref_key" ON "app"."deals" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "deals_client_idx" ON "app"."deals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "deals_closed_at_idx" ON "app"."deals" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "partner_splits_client_idx" ON "app"."partner_splits" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "money_events_idempotency_key" ON "ledger"."money_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "money_events_occurred_at_idx" ON "ledger"."money_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "money_events_client_idx" ON "ledger"."money_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "money_events_deal_idx" ON "ledger"."money_events" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "money_events_batch_idx" ON "ledger"."money_events" USING btree ("import_batch_id");