import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';

const ConvertFXSchema = z.object({
  source_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid(),
  amount: z.number().int().positive(), // in minor units of source currency
});

export const fxRoutes: FastifyPluginAsync = async (fastify) => {
  
  fastify.get('/rates', async (request, reply) => {
    try {
      const rates = await db.selectFrom('exchange_rates').selectAll().execute();
      return reply.send(rates);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/convert', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const data = ConvertFXSchema.parse(request.body);

      if (data.source_account_id === data.destination_account_id) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Cannot convert to the same account' });
      }

      const result = await db.transaction().execute(async (trx) => {
        // Lock both accounts
        const accountIds = [data.source_account_id, data.destination_account_id].sort();
        await trx
          .selectFrom('accounts')
          .where('id', 'in', accountIds)
          .forUpdate()
          .execute();

        // 1. Fetch and validate accounts
        const sourceAccount = await trx
          .selectFrom('accounts')
          .selectAll()
          .where('id', '=', data.source_account_id)
          .executeTakeFirst();

        const destAccount = await trx
          .selectFrom('accounts')
          .selectAll()
          .where('id', '=', data.destination_account_id)
          .executeTakeFirst();

        if (!sourceAccount) throw new Error('SOURCE_NOT_FOUND');
        if (!destAccount) throw new Error('DESTINATION_NOT_FOUND');
        if (sourceAccount.user_id !== request.userId || destAccount.user_id !== request.userId) {
          throw new Error('UNAUTHORIZED');
        }
        if (sourceAccount.currency === destAccount.currency) {
          throw new Error('SAME_CURRENCY');
        }

        // 2. Check source balance
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

        // 3. Fetch Exchange Rate
        const exchangeRate = await trx
          .selectFrom('exchange_rates')
          .select('rate')
          .where('base_currency', '=', sourceAccount.currency)
          .where('target_currency', '=', destAccount.currency)
          .executeTakeFirst();

        if (!exchangeRate) {
          throw new Error('EXCHANGE_RATE_NOT_FOUND');
        }

        const rate = Number(exchangeRate.rate);
        const convertedAmount = BigInt(Math.floor(Number(data.amount) * rate));

        // 4. Fetch System Clearing Accounts
        const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
        const sourceClearingAccount = await trx
          .selectFrom('accounts')
          .select('id')
          .where('user_id', '=', SYSTEM_USER_ID)
          .where('currency', '=', sourceAccount.currency)
          .executeTakeFirst();

        const destClearingAccount = await trx
          .selectFrom('accounts')
          .select('id')
          .where('user_id', '=', SYSTEM_USER_ID)
          .where('currency', '=', destAccount.currency)
          .executeTakeFirst();

        if (!sourceClearingAccount || !destClearingAccount) {
          throw new Error('CLEARING_ACCOUNTS_MISSING');
        }

        // 5. Insert ledger transaction
        const [ledgerTx] = await trx
          .insertInto('ledger_transactions')
          .values({
            description: `FX Conversion from ${sourceAccount.currency} to ${destAccount.currency}`,
          })
          .returning('id')
          .execute();

        // 6. Insert 4 ledger entries (Double-Entry Accounting)
        await trx
          .insertInto('ledger_entries')
          .values([
            // Source Leg
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: sourceAccount.id,
              direction: 'DEBIT', // Decrease user balance
              amount: transferAmount.toString(),
              currency: sourceAccount.currency,
            },
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: sourceClearingAccount.id,
              direction: 'CREDIT', // Increase clearing balance
              amount: transferAmount.toString(),
              currency: sourceAccount.currency,
            },
            // Destination Leg
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: destClearingAccount.id,
              direction: 'DEBIT', // Decrease clearing balance
              amount: convertedAmount.toString(),
              currency: destAccount.currency,
            },
            {
              ledger_transaction_id: ledgerTx.id,
              account_id: destAccount.id,
              direction: 'CREDIT', // Increase user balance
              amount: convertedAmount.toString(),
              currency: destAccount.currency,
            }
          ])
          .execute();

        return {
          status: 'SUCCESS',
          source_amount: data.amount,
          source_currency: sourceAccount.currency,
          rate,
          converted_amount: Number(convertedAmount),
          destination_currency: destAccount.currency,
          ledger_transaction_id: ledgerTx.id
        };
      });

      return reply.status(200).send(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }

      const errorMessage = error.message;
      if (['INSUFFICIENT_FUNDS', 'SOURCE_NOT_FOUND', 'DESTINATION_NOT_FOUND', 'SAME_CURRENCY', 'EXCHANGE_RATE_NOT_FOUND'].includes(errorMessage)) {
        return reply.status(400).send({ error: 'Bad Request', message: errorMessage });
      }
      
      if (errorMessage === 'UNAUTHORIZED') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Not authorized to access these accounts' });
      }

      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
