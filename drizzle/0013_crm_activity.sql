CREATE TABLE "app"."crm_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text DEFAULT 'close' NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"kind" text NOT NULL,
	"user_id" text,
	"user_name" text,
	"direction" text,
	"duration_seconds" bigint,
	"occurred_at" timestamp with time zone,
	"lead_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."crm_activity" ADD CONSTRAINT "crm_activity_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."crm_activity" ADD CONSTRAINT "crm_activity_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_activity_provider_external_key" ON "app"."crm_activity" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "crm_activity_client_idx" ON "app"."crm_activity" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "crm_activity_occurred_idx" ON "app"."crm_activity" USING btree ("occurred_at");