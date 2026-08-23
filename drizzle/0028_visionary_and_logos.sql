ALTER TABLE "app"."clients" ADD COLUMN "logo" text;--> statement-breakpoint
-- The Visionary (Tico) — SIGNED 2026-08-23 per Daniel. Client row + the
-- locked 30%-after-fees rule, idempotent, only where absent.
INSERT INTO app.clients (name, slug, status, external_ref)
SELECT 'The Visionary', 'the-visionary', 'active', 'signed 2026-08-23'
WHERE NOT EXISTS (SELECT 1 FROM app.clients WHERE slug = 'the-visionary');
--> statement-breakpoint
INSERT INTO app.rev_share_rules (client_id, rate_bps, effective_from, note)
SELECT c.id, 3000, '2026-08-16', 'The Visionary — 30% after fees (signed 8/23; first payment 8/16)'
FROM app.clients c
WHERE c.slug = 'the-visionary'
  AND NOT EXISTS (SELECT 1 FROM app.rev_share_rules r WHERE r.client_id = c.id);
