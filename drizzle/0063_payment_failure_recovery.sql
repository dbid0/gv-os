ALTER TABLE "app"."payment_events" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "app"."payment_events" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "app"."payment_events" ADD COLUMN "customer_ref" text;--> statement-breakpoint
ALTER TABLE "app"."payment_events" ADD COLUMN "recovery_status" text;