CREATE TABLE "app"."kit_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"client_id" uuid,
	"external_id" text NOT NULL,
	"subject" text,
	"preview_text" text,
	"sent_at" timestamp with time zone,
	"status" text,
	"recipients" integer,
	"emails_opened" integer,
	"open_rate_bps" integer,
	"total_clicks" integer,
	"click_rate_bps" integer,
	"unsubscribes" integer,
	"open_tracking_disabled" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."kit_broadcasts" ADD CONSTRAINT "kit_broadcasts_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kit_broadcasts" ADD CONSTRAINT "kit_broadcasts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kit_broadcasts_integration_external_key" ON "app"."kit_broadcasts" USING btree ("integration_id","external_id");--> statement-breakpoint
CREATE INDEX "kit_broadcasts_client_idx" ON "app"."kit_broadcasts" USING btree ("client_id");