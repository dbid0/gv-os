CREATE TABLE "app"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text DEFAULT 'typeform' NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"form_id" text,
	"form_name" text,
	"email" text,
	"name" text,
	"submitted_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."signed_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"provider" text DEFAULT 'pandadoc' NOT NULL,
	"external_id" text NOT NULL,
	"client_id" uuid,
	"name" text,
	"doc_status" text,
	"recipient_email" text,
	"completed_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."applications" ADD CONSTRAINT "applications_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."applications" ADD CONSTRAINT "applications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signed_docs" ADD CONSTRAINT "signed_docs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "app"."integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signed_docs" ADD CONSTRAINT "signed_docs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_provider_external_key" ON "app"."applications" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "applications_client_idx" ON "app"."applications" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "applications_submitted_idx" ON "app"."applications" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signed_docs_provider_external_key" ON "app"."signed_docs" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "signed_docs_client_idx" ON "app"."signed_docs" USING btree ("client_id");