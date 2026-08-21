CREATE TABLE "app"."kit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"client_id" uuid,
	"account_name" text,
	"plan" text,
	"sequence_count" bigint DEFAULT 0 NOT NULL,
	"tag_count" bigint DEFAULT 0 NOT NULL,
	"sequences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."kit_snapshots" ADD CONSTRAINT "kit_snapshots_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kit_snapshots" ADD CONSTRAINT "kit_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kit_snapshots_integration_idx" ON "app"."kit_snapshots" USING btree ("integration_id");