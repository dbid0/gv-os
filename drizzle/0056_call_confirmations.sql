CREATE TABLE "app"."call_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"client_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"confirmed_role" text,
	"corrected_email" text,
	"corrected_phone" text,
	"pre_call_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."call_confirmations" ADD CONSTRAINT "call_confirmations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."call_confirmations" ADD CONSTRAINT "call_confirmations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_confirmations_booking_key" ON "app"."call_confirmations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "call_confirmations_client_idx" ON "app"."call_confirmations" USING btree ("client_id");