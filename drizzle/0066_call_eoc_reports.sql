CREATE TABLE "app"."call_eoc_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"lead_email" text NOT NULL,
	"payment_email" text,
	"outcome" text NOT NULL,
	"close_type" text,
	"cash_collected_cents" bigint,
	"contract_value_cents" bigint,
	"closer_rep_id" uuid,
	"setter_rep_id" uuid,
	"recording_url" text,
	"notes" text,
	"call_at" timestamp with time zone NOT NULL,
	"submission_key" text NOT NULL,
	"submitted_by" text,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_eoc_reports_outcome_check" CHECK ("app"."call_eoc_reports"."outcome" in ('closed', 'follow_up', 'not_a_fit', 'no_show', 'rescheduled', 'cancelled')),
	CONSTRAINT "call_eoc_reports_close_type_check" CHECK ("app"."call_eoc_reports"."close_type" is null or "app"."call_eoc_reports"."close_type" in ('pif', 'split', 'deposit', 'installments')),
	CONSTRAINT "call_eoc_reports_close_fields_check" CHECK ("app"."call_eoc_reports"."outcome" = 'closed' or ("app"."call_eoc_reports"."close_type" is null and "app"."call_eoc_reports"."cash_collected_cents" is null and "app"."call_eoc_reports"."contract_value_cents" is null)),
	CONSTRAINT "call_eoc_reports_closed_needs_value_check" CHECK ("app"."call_eoc_reports"."outcome" <> 'closed' or ("app"."call_eoc_reports"."close_type" is not null and "app"."call_eoc_reports"."contract_value_cents" is not null and "app"."call_eoc_reports"."cash_collected_cents" is not null)),
	CONSTRAINT "call_eoc_reports_money_nonnegative_check" CHECK (coalesce("app"."call_eoc_reports"."cash_collected_cents", 0) >= 0 and coalesce("app"."call_eoc_reports"."contract_value_cents", 0) >= 0),
	CONSTRAINT "call_eoc_reports_cash_within_contract_check" CHECK ("app"."call_eoc_reports"."cash_collected_cents" is null or "app"."call_eoc_reports"."contract_value_cents" is null or "app"."call_eoc_reports"."cash_collected_cents" <= "app"."call_eoc_reports"."contract_value_cents"),
	CONSTRAINT "call_eoc_reports_email_check" CHECK (position('@' in "app"."call_eoc_reports"."lead_email") > 1)
);
--> statement-breakpoint
ALTER TABLE "app"."call_eoc_reports" ADD CONSTRAINT "call_eoc_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."call_eoc_reports" ADD CONSTRAINT "call_eoc_reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "app"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."call_eoc_reports" ADD CONSTRAINT "call_eoc_reports_closer_rep_id_reps_id_fk" FOREIGN KEY ("closer_rep_id") REFERENCES "app"."reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."call_eoc_reports" ADD CONSTRAINT "call_eoc_reports_setter_rep_id_reps_id_fk" FOREIGN KEY ("setter_rep_id") REFERENCES "app"."reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_eoc_reports_client_idx" ON "app"."call_eoc_reports" USING btree ("client_id","call_at");--> statement-breakpoint
CREATE INDEX "call_eoc_reports_lead_idx" ON "app"."call_eoc_reports" USING btree ("client_id","lead_email");--> statement-breakpoint
CREATE UNIQUE INDEX "call_eoc_reports_submission_key" ON "app"."call_eoc_reports" USING btree ("submission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "call_eoc_reports_active_booking_key" ON "app"."call_eoc_reports" USING btree ("booking_id") WHERE "app"."call_eoc_reports"."voided_at" is null and "app"."call_eoc_reports"."booking_id" is not null;