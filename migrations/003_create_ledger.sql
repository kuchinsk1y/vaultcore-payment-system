CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  direction VARCHAR(10) NOT NULL,
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: We are ignoring the 'balance' column in the accounts table and using the ledger instead.
-- We could drop the column entirely to ensure no one relies on it, but we'll leave it as a dead column
-- or drop it to enforce the new architectural rule. Let's drop it to enforce correctness.
ALTER TABLE accounts DROP COLUMN balance;
