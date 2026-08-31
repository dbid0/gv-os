CREATE TABLE "app"."workspace_database_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."workspace_database_rows" ADD CONSTRAINT "workspace_database_rows_database_id_workspace_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "app"."workspace_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_databases" ADD CONSTRAINT "workspace_databases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_database_rows_db_sort_idx" ON "app"."workspace_database_rows" USING btree ("database_id","sort_order");--> statement-breakpoint
CREATE INDEX "workspace_databases_client_idx" ON "app"."workspace_databases" USING btree ("client_id");