CREATE TABLE "app"."pipeline_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"niche" text,
	"followers" bigint,
	"stage" text DEFAULT 'lead' NOT NULL,
	"setup_fee_cents" bigint DEFAULT 0 NOT NULL,
	"rev_share_bps" bigint DEFAULT 0 NOT NULL,
	"est_monthly_rev_cents" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"owner_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pipeline_prospects_stage_idx" ON "app"."pipeline_prospects" USING btree ("stage");