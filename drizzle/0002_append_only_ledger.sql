-- Append-only enforcement for ledger.money_events.
--
-- Drizzle generates tables, not guarantees. This is the guarantee: money
-- history cannot be altered by anyone, including us, including a bug.
--
-- The rule is enforced twice on purpose. The trigger catches every path,
-- including a superuser session. The revoked grants mean the application role
-- cannot even attempt it. Either alone would be a convention; together they are
-- a control.
--
-- Corrections use a REVERSING row (reverses_id), never an edit. That is how a
-- bookkeeper works, and it is why a bad month is always recoverable.

CREATE OR REPLACE FUNCTION ledger.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ledger.% is append-only: % is not permitted. Insert a reversing entry instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER money_events_no_update
  BEFORE UPDATE ON ledger.money_events
  FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
--> statement-breakpoint

CREATE TRIGGER money_events_no_delete
  BEFORE DELETE ON ledger.money_events
  FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
--> statement-breakpoint

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own statement-level guard.
CREATE TRIGGER money_events_no_truncate
  BEFORE TRUNCATE ON ledger.money_events
  FOR EACH STATEMENT EXECUTE FUNCTION ledger.reject_mutation();
--> statement-breakpoint

-- A reversal must point at a real event.
ALTER TABLE ledger.money_events
  ADD CONSTRAINT money_events_reverses_fk
  FOREIGN KEY (reverses_id) REFERENCES ledger.money_events(id);
--> statement-breakpoint

-- An event cannot reverse itself.
ALTER TABLE ledger.money_events
  ADD CONSTRAINT money_events_no_self_reversal
  CHECK (reverses_id IS NULL OR reverses_id <> id);
--> statement-breakpoint

-- A zero-amount money event is always a mistake: either the amount was lost on
-- the way in, or the row should not exist. Reject it at the boundary.
ALTER TABLE ledger.money_events
  ADD CONSTRAINT money_events_amount_nonzero
  CHECK (amount_cents <> 0);
--> statement-breakpoint

-- Cents are whole numbers by definition; bigint already guarantees that. What
-- this catches is an amount so large it is certainly a units error (dollars
-- entered where cents were expected, or a stray multiplication).
ALTER TABLE ledger.money_events
  ADD CONSTRAINT money_events_amount_sane
  CHECK (amount_cents BETWEEN -1000000000000 AND 1000000000000);
