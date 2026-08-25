CREATE TABLE "app"."client_ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"occurred_on" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text,
	"entered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."client_ad_spend" ADD CONSTRAINT "client_ad_spend_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_ad_spend_client_idx" ON "app"."client_ad_spend" USING btree ("client_id");