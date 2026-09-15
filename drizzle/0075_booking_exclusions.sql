CREATE TABLE "app"."booking_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"excluded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_exclusions_reason_check" CHECK (length(trim("app"."booking_exclusions"."reason")) between 3 and 200)
);
--> statement-breakpoint
ALTER TABLE "app"."booking_exclusions" ADD CONSTRAINT "booking_exclusions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."booking_exclusions" ADD CONSTRAINT "booking_exclusions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_exclusions_booking_key" ON "app"."booking_exclusions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_exclusions_client_idx" ON "app"."booking_exclusions" USING btree ("client_id");