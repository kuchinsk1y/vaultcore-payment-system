import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

const CreateTransferSchema = z.object({
  source_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid(),
  amount: z.number().int().positive(), // in minor units
  currency: z.string().length(3),
});

export const transferRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    try {
      const data = CreateTransferSchema.parse(request.body);
      
      if (data.source_account_id === data.destination_account_id) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Cannot transfer to the same account' });
      }

      // Start transaction
      const transfer = await db.transaction().execute(async (trx) => {
        // Lock both accounts to prevent race conditions during balance check/update
        const accountIds = [data.source_account_id, data.destination_account_id].sort();
        
        await trx
          .selectFrom('accounts')
          .where('id', 'in', accountIds)
          .forUpdate()
          .execute();

        // 1. Check source account validity and balance via ledger
        const sourceAccount = await trx
          .selectFrom('accounts')
          .select('currency')
          .where('id', '=', data.source_account_id)
          .executeTakeFirst();

        if (!sourceAccount) throw new Error('SOURCE_NOT_FOUND');
        if (sourceAccount.currency !== data.currency) throw new Error('CURRENCY_MISMATCH');

        const sourceLedger = await trx
          .selectFrom('ledger_entries')
          .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
          .where('account_id', '=', data.source_account_id)
          .executeTakeFirst();

        const sourceBalance = BigInt(sourceLedger?.balance || 0);
        const transferAmount = BigInt(data.amount);

        if (sourceBalance < transferAmount) {
          throw new Error('INSUFFICIENT_FUNDS');
        }
        
        // Check destination account validity
        const destAccount = await trx
          .selectFrom('accounts')
          .select('currency')
          .where('id', '=', data.destination_account_id)
          .executeTakeFirst();
          
        if (!destAccount) throw new Error('DESTINATION_NOT_FOUND');
        if (destAccount.currency !== data.currency) throw new Error('CURRENCY_MISMATCH');

        // 2. Insert ledger transaction
        const [ledgerTx] = await trx
          .insertInto('ledger_transactions')
          .values({
            description: `Transfer from ${data.source_account_id} to ${data.destination_account_id}`,
          })
          .returning('id')
          .execute();

        // 3. Insert ledger entries
        await trx
          .insertInto('ledger_entries')
          .values([
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: data.source_account_id,
              direction: 'DEBIT',
              amount: data.amount,
              currency: data.currency,
            },
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: data.destination_account_id,
              direction: 'CREDIT',
              amount: data.amount,
              currency: data.currency,
            }
          ])
          .execute();

        // 4. Insert transfer record
        const [transferRecord] = await trx
          .insertInto('transfers')
          .values({
            source_account_id: data.source_account_id,
            destination_account_id: data.destination_account_id,
            amount: data.amount,
            currency: data.currency,
            status: 'SUCCESS',
          })
          .returningAll()
          .execute();

        return transferRecord;
      });

      return reply.status(201).send(transfer);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      
      if (error.message === 'INSUFFICIENT_FUNDS') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Insufficient funds' });
      }
      if (error.message === 'SOURCE_NOT_FOUND' || error.message === 'DESTINATION_NOT_FOUND') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Account not found' });
      }
      if (error.message === 'CURRENCY_MISMATCH') {
         return reply.status(400).send({ error: 'Bad Request', message: 'Currency mismatch' });
      }

      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
