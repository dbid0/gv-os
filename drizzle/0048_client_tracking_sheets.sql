CREATE TABLE "app"."client_tracking_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tab" text NOT NULL,
	"row_index" integer NOT NULL,
	"occurred_at" timestamp with time zone,
	"email" text,
	"name" text,
	"phone" text,
	"rep" text,
	"status" text,
	"outcome" text,
	"cash_cents" bigint,
	"revenue_cents" bigint,
	"recording_url" text,
	"notes" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."client_tracking_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"note" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"tabs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."client_tracking_rows" ADD CONSTRAINT "client_tracking_rows_sync_id_client_tracking_syncs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "app"."client_tracking_syncs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."client_tracking_rows" ADD CONSTRAINT "client_tracking_rows_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."client_tracking_syncs" ADD CONSTRAINT "client_tracking_syncs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_tracking_rows_sync_idx" ON "app"."client_tracking_rows" USING btree ("sync_id","tab");--> statement-breakpoint
CREATE INDEX "client_tracking_rows_client_tab_idx" ON "app"."client_tracking_rows" USING btree ("client_id","tab");--> statement-breakpoint
CREATE INDEX "client_tracking_rows_email_idx" ON "app"."client_tracking_rows" USING btree ("client_id","email");--> statement-breakpoint
CREATE INDEX "client_tracking_rows_occurred_idx" ON "app"."client_tracking_rows" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "client_tracking_syncs_client_idx" ON "app"."client_tracking_syncs" USING btree ("client_id","created_at");