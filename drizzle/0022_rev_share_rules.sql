CREATE TABLE "app"."rev_share_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"rate_bps" bigint NOT NULL,
	"effective_from" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."rev_share_rules" ADD CONSTRAINT "rev_share_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rev_share_rules_client_idx" ON "app"."rev_share_rules" USING btree ("client_id");--> statement-breakpoint
-- Seed the LOCKED contract rates (spec §4) where the client rows exist.
-- Idempotent: skips if a rule already exists for the client. The Visionary's
-- 30% waits for a confirmed signing; Racks' 10%-after-ad-spend needs the
-- deductions mechanism and is deliberately NOT seeded as a flat rate.
INSERT INTO app.rev_share_rules (client_id, rate_bps, effective_from, note)
SELECT c.id, 2000, '2026-07-14', 'The Grid — 20% after fees (locked 8/22 spec)'
FROM app.clients c
WHERE c.slug = 'the-grid'
  AND NOT EXISTS (SELECT 1 FROM app.rev_share_rules r WHERE r.client_id = c.id);
--> statement-breakpoint
INSERT INTO app.rev_share_rules (client_id, rate_bps, effective_from, note)
SELECT c.id, 1500, '2026-07-03', 'The Vault — 15% after fees (locked 8/22 spec)'
FROM app.clients c
WHERE c.slug = 'the-vault'
  AND NOT EXISTS (SELECT 1 FROM app.rev_share_rules r WHERE r.client_id = c.id);
