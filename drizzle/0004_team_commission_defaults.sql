ALTER TABLE "app"."clients" ADD COLUMN "default_closer_bps" bigint;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "default_setter_bps" bigint;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "default_dm_setter_bps" bigint;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "default_manager_bps" bigint;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "deduct_processor_fees" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "processor_fee_bps" bigint;--> statement-breakpoint
ALTER TABLE "app"."clients" ADD COLUMN "processor_fee_flat_cents" bigint;