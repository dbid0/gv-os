CREATE TABLE "app"."payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"email" text,
	"occurred_at" timestamp with time zone,
	"label" text,
	"status" text DEFAULT 'captured' NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."payment_events" ADD CONSTRAINT "payment_events_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_events" ADD CONSTRAINT "payment_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_external_key" ON "app"."payment_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "payment_events_client_idx" ON "app"."payment_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payment_events_integration_idx" ON "app"."payment_events" USING btree ("integration_id");