CREATE TABLE "app"."payment_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"client_id" uuid,
	"role" text NOT NULL,
	"rep_id" uuid NOT NULL,
	"rate_override_bps" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."payment_assignments" ADD CONSTRAINT "payment_assignments_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "app"."payment_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_assignments" ADD CONSTRAINT "payment_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_assignments" ADD CONSTRAINT "payment_assignments_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_assignments_payment_role_key" ON "app"."payment_assignments" USING btree ("payment_event_id","role");--> statement-breakpoint
CREATE INDEX "payment_assignments_client_idx" ON "app"."payment_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payment_assignments_rep_idx" ON "app"."payment_assignments" USING btree ("rep_id");