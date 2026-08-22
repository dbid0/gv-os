CREATE TABLE "app"."agency_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_on" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"transaction_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."agency_expenses" ADD CONSTRAINT "agency_expenses_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_expenses_occurred_idx" ON "app"."agency_expenses" USING btree ("occurred_on");