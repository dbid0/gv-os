CREATE TABLE "app"."quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"rep_id" uuid,
	"client_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"target_amount" bigint NOT NULL,
	"period" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."quotas" ADD CONSTRAINT "quotas_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quotas" ADD CONSTRAINT "quotas_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotas_client_idx" ON "app"."quotas" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quotas_rep_idx" ON "app"."quotas" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "quotas_period_idx" ON "app"."quotas" USING btree ("period");