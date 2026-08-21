CREATE TABLE "app"."sheet_mirror_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"row_index" bigint NOT NULL,
	"date_closed" text NOT NULL,
	"client" text NOT NULL,
	"deal_type" text NOT NULL,
	"offer" text,
	"method" text NOT NULL,
	"payout_status" text,
	"revenue_cents" bigint NOT NULL,
	"cash_cents" bigint NOT NULL,
	"figures" jsonb NOT NULL,
	"has_drift" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sheet_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"note" text,
	"row_count" bigint DEFAULT 0 NOT NULL,
	"drift_row_count" bigint DEFAULT 0 NOT NULL,
	"total_abs_drift_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."sheet_mirror_deals" ADD CONSTRAINT "sheet_mirror_deals_run_id_sheet_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "app"."sheet_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheet_mirror_deals_run_idx" ON "app"."sheet_mirror_deals" USING btree ("run_id");