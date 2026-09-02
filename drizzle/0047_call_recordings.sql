CREATE TABLE "app"."call_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'fathom' NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"activity_log_id" uuid,
	"title" text,
	"recording_url" text,
	"transcript" text,
	"summary" text,
	"duration_seconds" bigint,
	"occurred_at" timestamp with time zone,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis_outcome" text,
	"analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analyzed_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."call_recordings" ADD CONSTRAINT "call_recordings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."call_recordings" ADD CONSTRAINT "call_recordings_activity_log_id_activity_logs_id_fk" FOREIGN KEY ("activity_log_id") REFERENCES "app"."activity_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_recordings_provider_external_key" ON "app"."call_recordings" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "call_recordings_client_idx" ON "app"."call_recordings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "call_recordings_activity_idx" ON "app"."call_recordings" USING btree ("activity_log_id");--> statement-breakpoint
CREATE INDEX "call_recordings_occurred_idx" ON "app"."call_recordings" USING btree ("occurred_at");