ALTER TABLE "app"."client_tracking_rows" ADD COLUMN "source" text DEFAULT 'sheet' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."client_tracking_syncs" ADD COLUMN "source" text DEFAULT 'sheet' NOT NULL;--> statement-breakpoint
CREATE INDEX "client_tracking_rows_source_idx" ON "app"."client_tracking_rows" USING btree ("client_id","source","tab");--> statement-breakpoint
CREATE INDEX "client_tracking_syncs_source_idx" ON "app"."client_tracking_syncs" USING btree ("client_id","source","created_at");