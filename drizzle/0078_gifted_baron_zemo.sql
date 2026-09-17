CREATE TABLE "app"."calendar_feed_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"client_id" uuid,
	"occurrence_key" text NOT NULL,
	"summary" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"day_key" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."calendar_feed_events" ADD CONSTRAINT "calendar_feed_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."calendar_feed_events" ADD CONSTRAINT "calendar_feed_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feed_events_key" ON "app"."calendar_feed_events" USING btree ("integration_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "calendar_feed_events_day_idx" ON "app"."calendar_feed_events" USING btree ("day_key");