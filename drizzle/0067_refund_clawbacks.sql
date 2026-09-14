CREATE TABLE "app"."payment_clawback_waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_event_id" uuid NOT NULL,
	"role" text NOT NULL,
	"reason" text NOT NULL,
	"waived_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_clawback_waivers_role_check" CHECK ("app"."payment_clawback_waivers"."role" in ('setter', 'closer', 'dm_setter')),
	CONSTRAINT "payment_clawback_waivers_reason_check" CHECK (length(trim("app"."payment_clawback_waivers"."reason")) between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "app"."payment_refund_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_event_id" uuid NOT NULL,
	"charge_event_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refund_links_distinct_check" CHECK ("app"."payment_refund_links"."refund_event_id" <> "app"."payment_refund_links"."charge_event_id")
);
--> statement-breakpoint
ALTER TABLE "app"."payment_clawback_waivers" ADD CONSTRAINT "payment_clawback_waivers_refund_event_id_payment_events_id_fk" FOREIGN KEY ("refund_event_id") REFERENCES "app"."payment_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_refund_links" ADD CONSTRAINT "payment_refund_links_refund_event_id_payment_events_id_fk" FOREIGN KEY ("refund_event_id") REFERENCES "app"."payment_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_refund_links" ADD CONSTRAINT "payment_refund_links_charge_event_id_payment_events_id_fk" FOREIGN KEY ("charge_event_id") REFERENCES "app"."payment_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_refund_links" ADD CONSTRAINT "payment_refund_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_clawback_waivers_refund_role_key" ON "app"."payment_clawback_waivers" USING btree ("refund_event_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refund_links_refund_key" ON "app"."payment_refund_links" USING btree ("refund_event_id");--> statement-breakpoint
CREATE INDEX "payment_refund_links_charge_idx" ON "app"."payment_refund_links" USING btree ("charge_event_id");