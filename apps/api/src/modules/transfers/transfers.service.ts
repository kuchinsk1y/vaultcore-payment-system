import { sql } from 'kysely';
import { db } from '../../infrastructure/database';
import { FraudService } from '../fraud/fraud.service';
import { OutboxService } from '../outbox/outbox.service';
import { transferErrors } from './transfer.errors';
import { assertTransferAllowed } from './transfer.rules';

export interface CreateTransferInput {
  userId: string;
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number; // minor units
  currency: string;
}

export const TransfersService = {
  /**
   * Fraud check, run BEFORE anything is created (and before a confirmation code is requested).
   * The evaluation is logged whatever the outcome; a BLOCKED transfer is rejected.
   */
  async assessRisk(userId: string, sourceAccountId: string, amount: number) {
    const risk = await FraudService.evaluateTransferRisk(userId, sourceAccountId, amount);
    await FraudService.logRisk(userId, risk);
    if (risk.status === 'BLOCKED') throw transferErrors.highRisk();
  },

  /**
   * Moves money atomically (ledger entries + transfer record +
   * outbox event + idempotency record in one transaction).
   */
  async createTransfer(input: CreateTransferInput) {
    const { userId, idempotencyKey, sourceAccountId, destinationAccountId, amount, currency } = input;

    if (sourceAccountId === destinationAccountId) throw transferErrors.sameAccount();

    return db.transaction().execute(async (trx) => {
      // Lock both accounts in a stable order to prevent races and deadlocks
      const accountIds = [sourceAccountId, destinationAccountId].sort();
      await trx.selectFrom('accounts').where('id', 'in', accountIds).forUpdate().execute();

      const source = await trx
        .selectFrom('accounts')
        .select(['currency', 'user_id'])
        .where('id', '=', sourceAccountId)
        .executeTakeFirst();

      const ledger = await trx
        .selectFrom('ledger_entries')
        .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
        .where('account_id', '=', sourceAccountId)
        .executeTakeFirst();

      const destination = await trx
        .selectFrom('accounts')
        .select('currency')
        .where('id', '=', destinationAccountId)
        .executeTakeFirst();

      assertTransferAllowed({
        userId,
        currency,
        amount,
        sourceAccountId,
        destinationAccountId,
        source,
        sourceBalance: BigInt(ledger?.balance || 0),
        destination,
      });

      const [ledgerTx] = await trx
        .insertInto('ledger_transactions')
        .values({ description: `Transfer from ${sourceAccountId} to ${destinationAccountId}`, kind: 'TRANSFER' })
        .returning('id')
        .execute();

      await trx
        .insertInto('ledger_entries')
        .values([
          { ledger_transaction_id: ledgerTx.id, account_id: sourceAccountId, direction: 'DEBIT', amount, currency },
          { ledger_transaction_id: ledgerTx.id, account_id: destinationAccountId, direction: 'CREDIT', amount, currency },
        ])
        .execute();

      const [transferRecord] = await trx
        .insertInto('transfers')
        .values({
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount,
          currency,
          status: 'SUCCESS',
        })
        .returningAll()
        .execute();

      await OutboxService.writeEvent(trx, {
        aggregate_type: 'TRANSFER',
        aggregate_id: transferRecord.id,
        event_type: 'transfer.completed',
        payload: transferRecord,
      });

      await trx
        .insertInto('idempotency_keys')
        .values({
          key: idempotencyKey,
          response_status: 201,
          response_body: JSON.stringify(transferRecord),
        })
        .execute();

      return transferRecord;
    });
  },

  async findIdempotentResponse(key: string) {
    return db
      .selectFrom('idempotency_keys')
      .select(['response_status', 'response_body'])
      .where('key', '=', key)
      .executeTakeFirst();
  },

  async saveErrorResponse(key: string, status: number, body: unknown) {
    await db
      .insertInto('idempotency_keys')
      .values({ key, response_status: status, response_body: JSON.stringify(body) })
      .execute();
  },
};
