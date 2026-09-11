CREATE TABLE "app"."utm_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"destination_url" text NOT NULL,
	"utm_source" text NOT NULL,
	"utm_medium" text NOT NULL,
	"utm_campaign" text NOT NULL,
	"utm_content" text NOT NULL,
	"assembled_url" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."utm_links" ADD CONSTRAINT "utm_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "utm_links_client_idx" ON "app"."utm_links" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "utm_links_created_idx" ON "app"."utm_links" USING btree ("created_at");