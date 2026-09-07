import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

import { Generated } from 'kysely';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  created_at: Generated<Date>;
}

export interface AccountsTable {
  id: Generated<string>;
  user_id: string;
  currency: string;
  status: Generated<string>;
  created_at: Generated<Date>;
}

export interface TransfersTable {
  id: Generated<string>;
  source_account_id: string;
  destination_account_id: string;
  amount: string | number;
  currency: string;
  status: Generated<string>;
  created_at: Generated<Date>;
}

export interface LedgerTransactionsTable {
  id: Generated<string>;
  description: string | null;
  created_at: Generated<Date>;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  ledger_transaction_id: string;
  account_id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string | number;
  currency: string;
  created_at: Generated<Date>;
}

export interface IdempotencyKeysTable {
  key: string;
  response_status: number;
  response_body: any; // JSONB
  created_at: Generated<Date>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: any; // JSONB
  status: Generated<string>;
  created_at: Generated<Date>;
  processed_at: Date | null;
}

export interface WebhookEventsTable {
  id: Generated<string>;
  provider_event_id: string;
  event_type: string;
  payload: any; // JSONB
  status: Generated<string>;
  created_at: Generated<Date>;
  processed_at: Date | null;
}

export interface ExchangeRatesTable {
  id: Generated<string>;
  base_currency: string;
  target_currency: string;
  rate: string | number; // NUMERIC
  created_at: Generated<Date>;
}

export interface CardsTable {
  id: Generated<string>;
  user_id: string;
  account_id: string;
  card_type: 'VIRTUAL' | 'PHYSICAL';
  last_four: string;
  status: Generated<'ACTIVE' | 'FROZEN' | 'BLOCKED'>;
  spending_limit: Generated<number>;
  created_at: Generated<Date>;
}

export interface RiskLogsTable {
  id: Generated<string>;
  transaction_id: string | null;
  user_id: string;
  risk_score: number;
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  reason: string;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  accounts: AccountsTable;
  transfers: TransfersTable;
  ledger_transactions: LedgerTransactionsTable;
  ledger_entries: LedgerEntriesTable;
  idempotency_keys: IdempotencyKeysTable;
  outbox_events: OutboxEventsTable;
  webhook_events: WebhookEventsTable;
  exchange_rates: ExchangeRatesTable;
  cards: CardsTable;
  risk_logs: RiskLogsTable;
}

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://paycore:password@localhost:5432/paycore',
  }),
});

export const db = new Kysely<Database>({
  dialect,
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`.execute(db);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
