CREATE TABLE "app"."activity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rep_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"report_date" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'eod' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."commission_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"rep_id" uuid NOT NULL,
	"role" text NOT NULL,
	"rate_bps" bigint NOT NULL,
	"basis" text DEFAULT 'cash_collected' NOT NULL,
	"bonus_cents" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."reps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"commission_bps" bigint,
	"base_pay_cents" bigint,
	"top_line_skim_bps" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."deals" ADD COLUMN "rep_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."deals" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "app"."deals" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "app"."deals" ADD COLUMN "lead_source" text;--> statement-breakpoint
ALTER TABLE "app"."deals" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "app"."activity_reports" ADD CONSTRAINT "activity_reports_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."activity_reports" ADD CONSTRAINT "activity_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."commission_splits" ADD CONSTRAINT "commission_splits_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "app"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."commission_splits" ADD CONSTRAINT "commission_splits_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reps" ADD CONSTRAINT "reps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reps" ADD CONSTRAINT "reps_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_reports_rep_idx" ON "app"."activity_reports" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "activity_reports_date_idx" ON "app"."activity_reports" USING btree ("report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_reports_external_ref_key" ON "app"."activity_reports" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "commission_splits_deal_idx" ON "app"."commission_splits" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "commission_splits_rep_idx" ON "app"."commission_splits" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "reps_client_idx" ON "app"."reps" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reps_external_ref_key" ON "app"."reps" USING btree ("external_ref");--> statement-breakpoint
ALTER TABLE "app"."deals" ADD CONSTRAINT "deals_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;