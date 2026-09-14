ALTER TABLE "app"."utm_links" ADD COLUMN "short_code" text;--> statement-breakpoint
ALTER TABLE "app"."utm_links" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."utm_links" ADD COLUMN "last_clicked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "utm_links_short_code_key" ON "app"."utm_links" USING btree ("short_code");--> statement-breakpoint
ALTER TABLE "app"."utm_links" ADD CONSTRAINT "utm_links_short_code_check" CHECK ("app"."utm_links"."short_code" is null or "app"."utm_links"."short_code" ~ '^[a-z0-9]{7}$');--> statement-breakpoint
-- Backfill: every link issued before short links existed gets its own code.
UPDATE "app"."utm_links" SET "short_code" = substr(md5("id"::text), 1, 7) WHERE "short_code" IS NULL;
