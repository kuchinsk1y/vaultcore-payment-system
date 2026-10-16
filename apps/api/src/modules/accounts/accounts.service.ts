import { sql } from 'kysely';
import { db } from '../../infrastructure/database';
import { SYSTEM_USER_ID } from '../../infrastructure/system';

export type CloseAccountResult = 'CLOSED' | 'NOT_FOUND' | 'ALREADY_CLOSED' | 'NON_ZERO_BALANCE';

export const AccountsService = {
  /** Currencies the platform can hold: one system clearing account exists for each. */
  async supportedCurrencies(): Promise<string[]> {
    const rows = await db
      .selectFrom('accounts')
      .select('currency')
      .where('user_id', '=', SYSTEM_USER_ID)
      .orderBy('currency')
      .execute();
    return rows.map((r) => r.currency);
  },

  async closeAccount(userId: string, accountId: string): Promise<CloseAccountResult> {
    const accountRow = await db
      .selectFrom('accounts as a')
      .leftJoin('ledger_entries as le', 'a.id', 'le.account_id')
      .select([
        'a.id',
        'a.user_id',
        'a.status',
        db.fn
          .coalesce(sql<string>`SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)`, sql<string>`'0'`)
          .as('balance'),
      ])
      .where('a.id', '=', accountId)
      .where('a.user_id', '=', userId)
      .groupBy('a.id')
      .executeTakeFirst();

    if (!accountRow) return 'NOT_FOUND';
    if (accountRow.status === 'CLOSED') return 'ALREADY_CLOSED';
    if (Number(accountRow.balance) / 100 !== 0) return 'NON_ZERO_BALANCE';

    await db
      .updateTable('accounts')
      .set({ status: 'CLOSED' })
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .execute();

    return 'CLOSED';
  },

  /** Ledger history of an account owned by `userId`, or null if it does not exist / is not theirs. */
  async getLedger(userId: string, accountId: string) {
    const account = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', accountId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!account) return null;

    const entries = await db
      .selectFrom('ledger_entries as le')
      .innerJoin('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
      .select([
        'le.id',
        'le.ledger_transaction_id',
        'le.direction',
        'le.amount',
        'le.currency',
        'le.created_at',
        'lt.description',
      ])
      .where('le.account_id', '=', accountId)
      .orderBy('le.created_at', 'desc')
      // Limiting to 1000 for client-side filtering capabilities
      .limit(1000)
      .execute();

    // For a transfer, the other side is another ledger entry in the same transaction
    const txIds = entries.map((e) => e.ledger_transaction_id);
    const counterparties =
      txIds.length === 0
        ? []
        : await db
            .selectFrom('ledger_entries as le')
            .innerJoin('accounts as a', 'a.id', 'le.account_id')
            .innerJoin('users as u', 'u.id', 'a.user_id')
            .select(['le.ledger_transaction_id', 'u.full_name', 'a.id as account_id'])
            .where('le.account_id', '!=', accountId)
            .where('le.ledger_transaction_id', 'in', txIds)
            .execute();

    return entries.map((entry) => {
      const counterparty = counterparties.find((c) => c.ledger_transaction_id === entry.ledger_transaction_id);
      return {
        id: entry.id,
        date: entry.created_at,
        description: entry.description,
        amount: Number(entry.amount) / 100,
        currency: entry.currency,
        direction: entry.direction,
        counterparty_name: counterparty?.full_name || null,
        counterparty_account: counterparty?.account_id || null,
      };
    });
  },
};
