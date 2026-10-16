import '../config/env';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';


import { Generated } from 'kysely';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  country: string | null;
  city: string | null;
  zip_code: string | null;
  street: string | null;
  email_verified_at: Date | null;
  totp_secret_encrypted: string | null;
  totp_enabled_at: Date | null;
  totp_last_used_step: string | number | null;
  failed_login_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: Generated<Date>;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Generated<Date>;
  last_used_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export interface OneTimeTokensTable {
  id: Generated<string>;
  user_id: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface TransferConfirmationsTable {
  id: Generated<string>;
  user_id: string;
  request_hash: string;
  method: 'EMAIL_OTP' | 'TOTP';
  code_hash: string | null;
  attempts: Generated<number>;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<string>;
  user_id: string | null;
  action: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Generated<unknown>;
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

export type LedgerTransactionKind = 'TRANSFER' | 'EXCHANGE' | 'TOP_UP' | 'DEPOSIT' | 'OTHER';

export interface LedgerTransactionsTable {
  id: Generated<string>;
  description: string | null;
  kind: Generated<LedgerTransactionKind>;
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

export interface ContactsTable {
  id: Generated<string>;
  user_id: string;
  contact_user_id: string;
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
  attempts: Generated<number>;
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
  pin_hash: string | null;
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
  contacts: ContactsTable;
  idempotency_keys: IdempotencyKeysTable;
  outbox_events: OutboxEventsTable;
  webhook_events: WebhookEventsTable;
  exchange_rates: ExchangeRatesTable;
  cards: CardsTable;
  risk_logs: RiskLogsTable;
  sessions: SessionsTable;
  one_time_tokens: OneTimeTokensTable;
  transfer_confirmations: TransferConfirmationsTable;
  audit_log: AuditLogTable;
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
