ALTER TABLE accounts ADD COLUMN balance BIGINT NOT NULL DEFAULT 0;

CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
