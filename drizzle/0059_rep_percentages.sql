CREATE TABLE "app"."rep_percentages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"sales_role" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."rep_percentages" ADD CONSTRAINT "rep_percentages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rep_percentages_client_idx" ON "app"."rep_percentages" USING btree ("client_id");