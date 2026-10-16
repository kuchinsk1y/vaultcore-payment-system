import { sql } from 'kysely';
import { db } from '../../src/infrastructure/database';

/**
 * Restores the rows migration 008 seeds: the system user and its clearing accounts (one per supported
 * currency). Tests that TRUNCATE users/accounts remove them, so they call this afterwards.
 */
export async function seedSystemData() {
  await sql`
    INSERT INTO users (id, email, full_name, password_hash)
    VALUES ('00000000-0000-0000-0000-000000000000', 'system@vaultcore.local', 'VaultCore System', NULL)
    ON CONFLICT (email) DO NOTHING`.execute(db);

  await sql`
    INSERT INTO accounts (id, user_id, currency, status) VALUES
      ('11111111-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'EUR', 'SYSTEM'),
      ('22222222-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'USD', 'SYSTEM'),
      ('33333333-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'PLN', 'SYSTEM')
    ON CONFLICT (id) DO NOTHING`.execute(db);

  await sql`
    INSERT INTO exchange_rates (base_currency, target_currency, rate) VALUES
      ('EUR', 'USD', 1.0850), ('USD', 'EUR', 0.9216),
      ('EUR', 'PLN', 4.3100), ('PLN', 'EUR', 0.2320),
      ('USD', 'PLN', 3.9723), ('PLN', 'USD', 0.2517)
    ON CONFLICT (base_currency, target_currency) DO NOTHING`.execute(db);
}
