CREATE TABLE "app"."workspace_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"parent_id" uuid,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"icon" text,
	"content" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."workspace_pages" ADD CONSTRAINT "workspace_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_pages" ADD CONSTRAINT "workspace_pages_parent_id_workspace_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."workspace_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_pages_client_idx" ON "app"."workspace_pages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "workspace_pages_parent_idx" ON "app"."workspace_pages" USING btree ("parent_id");