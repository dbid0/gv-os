CREATE TABLE "app"."workspace_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"token" text NOT NULL,
	"include_children" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."workspace_shares" ADD CONSTRAINT "workspace_shares_page_id_workspace_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "app"."workspace_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_shares_token_key" ON "app"."workspace_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "workspace_shares_page_idx" ON "app"."workspace_shares" USING btree ("page_id");