CREATE TABLE "app"."offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"price_cents" bigint,
	"kind" text DEFAULT 'one_time' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."rep_comp_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"role" text NOT NULL,
	"rep_id" uuid,
	"basis" text NOT NULL,
	"rate_bps" bigint,
	"flat_cents" bigint,
	"tier_threshold_cents" bigint,
	"tier_rate_bps" bigint,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rep_comp_rules" ADD CONSTRAINT "rep_comp_rules_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rep_comp_rules" ADD CONSTRAINT "rep_comp_rules_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_client_idx" ON "app"."offers" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_client_slug_key" ON "app"."offers" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "rep_comp_rules_offer_idx" ON "app"."rep_comp_rules" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "rep_comp_rules_rep_idx" ON "app"."rep_comp_rules" USING btree ("rep_id");