CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency VARCHAR(3) NOT NULL,
  target_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(15,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(base_currency, target_currency)
);

-- Insert a System User for internal clearing
INSERT INTO users (id, email, full_name, password_hash)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@vaultcore.local', 'VaultCore System', NULL)
ON CONFLICT (email) DO NOTHING;

-- Insert System Clearing Accounts
INSERT INTO accounts (id, user_id, currency, status)
VALUES 
  ('11111111-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'EUR', 'SYSTEM'),
  ('22222222-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'USD', 'SYSTEM'),
  ('33333333-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'PLN', 'SYSTEM')
ON CONFLICT (id) DO NOTHING;

-- Insert mock exchange rates
INSERT INTO exchange_rates (base_currency, target_currency, rate)
VALUES 
  ('EUR', 'USD', 1.0850),
  ('USD', 'EUR', 0.9216),
  ('EUR', 'PLN', 4.3100),
  ('PLN', 'EUR', 0.2320),
  ('USD', 'PLN', 3.9723),
  ('PLN', 'USD', 0.2517)
ON CONFLICT (base_currency, target_currency) DO UPDATE SET rate = EXCLUDED.rate;
