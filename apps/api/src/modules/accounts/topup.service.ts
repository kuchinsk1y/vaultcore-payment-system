import '../../config/env';
import { sql } from 'kysely';
import { db } from '../../infrastructure/database';
import { SYSTEM_USER_ID } from '../../infrastructure/system';

/**
 * Demo top-ups: money appears from the platform's clearing account, so every top-up is a balanced
 * double-entry transaction (DEBIT clearing / CREDIT user). Disabled in production by default.
 */
export const topUpConfig = {
  get enabled(): boolean {
    const flag = process.env.ENABLE_DEMO_TOPUP;
    return flag ? flag === 'true' : process.env.NODE_ENV !== 'production';
  },
  /** Minor units. */
  maxPerRequest: 500_000,
  maxPer24Hours: 2_000_000,
};

export class TopUpError extends Error {
  constructor(
    public readonly code: 'TOPUP_DISABLED' | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_NOT_ACTIVE' | 'LIMIT_EXCEEDED' | 'CURRENCY_UNSUPPORTED',
    public readonly status: number,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TopUpError';
  }
}

export const TopUpService = {
  async topUp(userId: string, accountId: string, amountMinor: number) {
    if (!topUpConfig.enabled) {
      throw new TopUpError('TOPUP_DISABLED', 403, 'Top-ups are disabled in this environment');
    }
    if (amountMinor > topUpConfig.maxPerRequest) {
      throw new TopUpError('LIMIT_EXCEEDED', 400, 'Amount exceeds the per-top-up limit', {
        max_per_request: topUpConfig.maxPerRequest,
      });
    }

    return db.transaction().execute(async (trx) => {
      // Locking the account serialises concurrent top-ups, so the 24h limit below cannot be raced
      const account = await trx
        .selectFrom('accounts')
        .select(['id', 'currency', 'status'])
        .where('id', '=', accountId)
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();

      if (!account) throw new TopUpError('ACCOUNT_NOT_FOUND', 404, 'Account not found');
      if (account.status !== 'ACTIVE') throw new TopUpError('ACCOUNT_NOT_ACTIVE', 400, 'Account is not active');

      const clearing = await trx
        .selectFrom('accounts')
        .select('id')
        .where('user_id', '=', SYSTEM_USER_ID)
        .where('currency', '=', account.currency)
        .executeTakeFirst();
      if (!clearing) throw new TopUpError('CURRENCY_UNSUPPORTED', 400, `Top-ups are not available in ${account.currency}`);

      const recent = await trx
        .selectFrom('ledger_entries as le')
        .innerJoin('ledger_transactions as lt', 'lt.id', 'le.ledger_transaction_id')
        .select(sql<string>`COALESCE(SUM(le.amount), 0)`.as('total'))
        .where('le.account_id', '=', account.id)
        .where('le.direction', '=', 'CREDIT')
        .where('lt.kind', '=', 'TOP_UP')
        .where('le.created_at', '>', sql<Date>`now() - interval '24 hours'`)
        .executeTakeFirstOrThrow();

      const remaining = topUpConfig.maxPer24Hours - Number(recent.total);
      if (amountMinor > remaining) {
        throw new TopUpError('LIMIT_EXCEEDED', 400, 'Daily top-up limit reached', {
          remaining_24h: Math.max(0, remaining),
          max_per_24h: topUpConfig.maxPer24Hours,
        });
      }

      const ledgerTx = await trx
        .insertInto('ledger_transactions')
        .values({ description: 'Top-up', kind: 'TOP_UP' })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('ledger_entries')
        .values([
          { ledger_transaction_id: ledgerTx.id, account_id: clearing.id, direction: 'DEBIT', amount: amountMinor, currency: account.currency },
          { ledger_transaction_id: ledgerTx.id, account_id: account.id, direction: 'CREDIT', amount: amountMinor, currency: account.currency },
        ])
        .execute();

      return {
        transaction_id: ledgerTx.id,
        account_id: account.id,
        amount_minor: amountMinor,
        currency: account.currency,
        remaining_24h: remaining - amountMinor,
      };
    });
  },
};
