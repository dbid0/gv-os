CREATE TABLE "app"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_on" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" text NOT NULL,
	"layer" text NOT NULL,
	"client_id" uuid,
	"deal_type" text,
	"offer" text,
	"description" text,
	"payment_method" text,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"cash_cents" bigint DEFAULT 0 NOT NULL,
	"processor_fee_cents" bigint DEFAULT 0 NOT NULL,
	"agreement_signed" boolean,
	"lead_email" text,
	"external" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"entered_by" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_key" ON "app"."transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "transactions_layer_idx" ON "app"."transactions" USING btree ("layer");--> statement-breakpoint
CREATE INDEX "transactions_client_idx" ON "app"."transactions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "transactions_occurred_on_idx" ON "app"."transactions" USING btree ("occurred_on");--> statement-breakpoint
-- Append-only guard, same discipline as ledger.money_events: the backlog is
-- corrected by reversing rows, never by editing history.
CREATE OR REPLACE FUNCTION app.transactions_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app.transactions is append-only — add a reversing row instead';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER transactions_no_update BEFORE UPDATE ON app.transactions
  FOR EACH ROW EXECUTE FUNCTION app.transactions_block_mutation();
--> statement-breakpoint
CREATE TRIGGER transactions_no_delete BEFORE DELETE ON app.transactions
  FOR EACH ROW EXECUTE FUNCTION app.transactions_block_mutation();
--> statement-breakpoint
CREATE TRIGGER transactions_no_truncate BEFORE TRUNCATE ON app.transactions
  FOR EACH STATEMENT EXECUTE FUNCTION app.transactions_block_mutation();
