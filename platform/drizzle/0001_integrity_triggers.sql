-- Integritätsregeln, die nicht als einfache CHECK-Constraints ausdrückbar sind.
-- 1) Jede Buchung im Journal ist ausgeglichen (Summe = 0, mind. zwei Einträge).
-- 2) Einträge verwenden dieselbe Münzwährung wie Buchung und Konto.
-- 3) Journal und Admin-Audit-Protokoll sind unveränderlich (append-only).

CREATE OR REPLACE FUNCTION ledger_assert_transaction_balanced() RETURNS trigger AS $$
DECLARE
  tx_id uuid;
  total numeric;
  entry_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN
    tx_id := NEW.transaction_id;
  ELSE
    tx_id := NEW.id;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total, entry_count
    FROM ledger_entries
   WHERE transaction_id = tx_id;

  IF entry_count < 2 THEN
    RAISE EXCEPTION 'ledger transaction % has fewer than two entries', tx_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is not balanced (sum = %)', tx_id, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_transaction_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transactions_balanced
  AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_transaction_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ledger_assert_entry_currency() RETURNS trigger AS $$
DECLARE
  tx_currency coin_currency;
  account_currency coin_currency;
BEGIN
  SELECT currency INTO tx_currency FROM ledger_transactions WHERE id = NEW.transaction_id;
  SELECT currency INTO account_currency FROM ledger_accounts WHERE id = NEW.account_id;
  IF tx_currency IS DISTINCT FROM account_currency THEN
    RAISE EXCEPTION 'ledger entry currency mismatch (transaction %, account %)', tx_currency, account_currency
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_currency
  BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_entry_currency();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER admin_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
