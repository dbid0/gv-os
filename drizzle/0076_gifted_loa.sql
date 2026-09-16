CREATE TABLE "app"."deal_payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"rate_bps" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."deal_payees" ADD CONSTRAINT "deal_payees_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_payees_transaction_idx" ON "app"."deal_payees" USING btree ("transaction_id");