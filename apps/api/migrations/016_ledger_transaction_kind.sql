-- Classify ledger transactions so clients can label them without parsing free-text descriptions.
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'OTHER';

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS ledger_transactions_kind_check;
ALTER TABLE ledger_transactions
  ADD CONSTRAINT ledger_transactions_kind_check
  CHECK (kind IN ('TRANSFER', 'EXCHANGE', 'TOP_UP', 'DEPOSIT', 'OTHER'));

-- Backfill rows created before the column existed
UPDATE ledger_transactions SET kind = 'TRANSFER' WHERE kind = 'OTHER' AND description LIKE 'Transfer from %';
UPDATE ledger_transactions SET kind = 'EXCHANGE' WHERE kind = 'OTHER' AND description LIKE 'FX Conversion %';
UPDATE ledger_transactions SET kind = 'DEPOSIT'  WHERE kind = 'OTHER' AND description LIKE 'Webhook payment %';
UPDATE ledger_transactions SET kind = 'TOP_UP'   WHERE kind = 'OTHER' AND (description LIKE 'Manual Funding%' OR description LIKE '%Top-up%');

-- Speeds up the per-account, newest-first transaction history
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_created
  ON ledger_entries (account_id, created_at DESC, id DESC);
