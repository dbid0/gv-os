CREATE TABLE "app"."lead_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"lead_email" text NOT NULL,
	"tag" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_tags_email_check" CHECK ("app"."lead_tags"."lead_email" = lower(trim("app"."lead_tags"."lead_email")) and position('@' in "app"."lead_tags"."lead_email") > 1),
	CONSTRAINT "lead_tags_tag_check" CHECK ("app"."lead_tags"."tag" ~ '^[a-z0-9][a-z0-9-]{0,31}$')
);
--> statement-breakpoint
CREATE TABLE "app"."lead_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_views_name_check" CHECK (length(trim("app"."lead_views"."name")) between 1 and 40),
	CONSTRAINT "lead_views_query_check" CHECK (length("app"."lead_views"."query") <= 500)
);
--> statement-breakpoint
ALTER TABLE "app"."lead_tags" ADD CONSTRAINT "lead_tags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lead_views" ADD CONSTRAINT "lead_views_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_tags_client_email_tag_key" ON "app"."lead_tags" USING btree ("client_id","lead_email","tag");--> statement-breakpoint
CREATE INDEX "lead_tags_client_tag_idx" ON "app"."lead_tags" USING btree ("client_id","tag");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_views_client_name_key" ON "app"."lead_views" USING btree ("client_id",lower("name"));