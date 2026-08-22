CREATE TABLE "app"."offer_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"eod_alert_time" text,
	"bod_alert_time" text DEFAULT '12:00',
	"confetti_threshold_cents" bigint DEFAULT 500000 NOT NULL,
	"visibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."offer_settings" ADD CONSTRAINT "offer_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_settings_client_key" ON "app"."offer_settings" USING btree ("client_id");