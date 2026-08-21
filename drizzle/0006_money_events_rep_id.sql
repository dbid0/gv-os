ALTER TABLE "ledger"."money_events" ADD COLUMN "rep_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger"."money_events" ADD CONSTRAINT "money_events_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "app"."reps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_events_rep_idx" ON "ledger"."money_events" USING btree ("rep_id");