CREATE TABLE "app"."team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"email" text,
	"client_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."action_items" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_members_client_idx" ON "app"."team_members" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "team_members_role_idx" ON "app"."team_members" USING btree ("role");--> statement-breakpoint
ALTER TABLE "app"."action_items" ADD CONSTRAINT "action_items_assignee_id_team_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "app"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_assignee_idx" ON "app"."action_items" USING btree ("assignee_id");