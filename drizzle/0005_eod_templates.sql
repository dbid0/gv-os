CREATE TABLE "app"."eod_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"role" text NOT NULL,
	"cadence" text DEFAULT 'eod' NOT NULL,
	"name" text NOT NULL,
	"base_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calc_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."eod_templates" ADD CONSTRAINT "eod_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eod_templates_client_idx" ON "app"."eod_templates" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eod_templates_external_ref_key" ON "app"."eod_templates" USING btree ("external_ref");