CREATE TABLE "app"."action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"due_date" date,
	"assignee" text,
	"client_id" uuid,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."action_items" ADD CONSTRAINT "action_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_cadence_idx" ON "app"."action_items" USING btree ("cadence");--> statement-breakpoint
CREATE INDEX "action_items_client_idx" ON "app"."action_items" USING btree ("client_id");