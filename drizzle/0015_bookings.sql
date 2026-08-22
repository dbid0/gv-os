CREATE TABLE "app"."bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"event_type" text,
	"invitee_name" text,
	"invitee_email" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"starts_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD CONSTRAINT "bookings_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_provider_external_key" ON "app"."bookings" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "app"."bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_starts_idx" ON "app"."bookings" USING btree ("starts_at");