CREATE TABLE "app"."student_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"student_email" text NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"coach" text,
	"notes" text,
	"submission_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	CONSTRAINT "student_calls_email_check" CHECK ("app"."student_calls"."student_email" = lower(trim("app"."student_calls"."student_email")) and position('@' in "app"."student_calls"."student_email") > 1),
	CONSTRAINT "student_calls_coach_check" CHECK ("app"."student_calls"."coach" is null or length(trim("app"."student_calls"."coach")) between 1 and 80),
	CONSTRAINT "student_calls_notes_check" CHECK ("app"."student_calls"."notes" is null or length("app"."student_calls"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "app"."offer_settings" ADD COLUMN "one_on_one_call_limit" integer;--> statement-breakpoint
ALTER TABLE "app"."student_calls" ADD CONSTRAINT "student_calls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_calls_submission_key" ON "app"."student_calls" USING btree ("submission_key");--> statement-breakpoint
CREATE INDEX "student_calls_client_email_idx" ON "app"."student_calls" USING btree ("client_id","student_email");--> statement-breakpoint
ALTER TABLE "app"."offer_settings" ADD CONSTRAINT "offer_settings_call_limit_check" CHECK ("app"."offer_settings"."one_on_one_call_limit" is null or "app"."offer_settings"."one_on_one_call_limit" between 1 and 520);