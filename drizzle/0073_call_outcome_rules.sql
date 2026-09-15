CREATE TABLE "app"."call_outcome_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"tag" text,
	"notify" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_outcome_rules_outcome_check" CHECK ("app"."call_outcome_rules"."outcome" in ('closed', 'follow_up', 'not_a_fit', 'no_show', 'rescheduled', 'cancelled')),
	CONSTRAINT "call_outcome_rules_tag_check" CHECK ("app"."call_outcome_rules"."tag" is null or "app"."call_outcome_rules"."tag" ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
	CONSTRAINT "call_outcome_rules_does_something_check" CHECK ("app"."call_outcome_rules"."tag" is not null or "app"."call_outcome_rules"."notify")
);
--> statement-breakpoint
ALTER TABLE "app"."lead_tags" ADD COLUMN "source_eoc_report_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."call_outcome_rules" ADD CONSTRAINT "call_outcome_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_outcome_rules_client_outcome_tag_key" ON "app"."call_outcome_rules" USING btree ("client_id","outcome",coalesce("tag", ''));--> statement-breakpoint
ALTER TABLE "app"."lead_tags" ADD CONSTRAINT "lead_tags_source_eoc_report_id_call_eoc_reports_id_fk" FOREIGN KEY ("source_eoc_report_id") REFERENCES "app"."call_eoc_reports"("id") ON DELETE set null ON UPDATE no action;