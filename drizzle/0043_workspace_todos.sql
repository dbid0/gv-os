CREATE TABLE "app"."workspace_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"task" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Not started' NOT NULL,
	"due_date" date,
	"assignee" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."workspace_todos" ADD CONSTRAINT "workspace_todos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_todos_client_sort_idx" ON "app"."workspace_todos" USING btree ("client_id","sort_order");