CREATE TABLE idempotency_keys (
  key VARCHAR PRIMARY KEY,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
