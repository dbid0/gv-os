CREATE TABLE "app"."activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text DEFAULT 'call' NOT NULL,
	"client_id" uuid NOT NULL,
	"rep_id" uuid,
	"call_type" text,
	"disposition" text NOT NULL,
	"recording_url" text,
	"lead_url" text,
	"customer_name" text,
	"customer_email" text,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."activity_logs" ADD CONSTRAINT "activity_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."activity_logs" ADD CONSTRAINT "activity_logs_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_client_idx" ON "app"."activity_logs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "activity_logs_rep_idx" ON "app"."activity_logs" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "activity_logs_disposition_idx" ON "app"."activity_logs" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "activity_logs_occurred_at_idx" ON "app"."activity_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_logs_external_ref_key" ON "app"."activity_logs" USING btree ("external_ref");