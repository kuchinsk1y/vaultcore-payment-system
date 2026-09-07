import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';
import { createRateLimiter } from '../../infrastructure/middleware/rate-limiter';
import { requireApiKey } from '../../infrastructure/middleware/auth';

const CreateTransferSchema = z.object({
  source_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid(),
  amount: z.number().int().positive(), // in minor units
  currency: z.string().length(3),
});

export const transferRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply a strict rate limit: max 10 requests per 60 seconds per IP for transfers
  const transferRateLimiter = createRateLimiter(10, 60);

  fastify.post('/', { preHandler: [requireApiKey, transferRateLimiter] }, async (request, reply) => {
    try {
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

      if (!idempotencyKey) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Missing Idempotency-Key header' });
      }

      // Check if idempotency key exists
      const existingIdempotency = await db
        .selectFrom('idempotency_keys')
        .select(['response_status', 'response_body'])
        .where('key', '=', idempotencyKey)
        .executeTakeFirst();

      if (existingIdempotency) {
        return reply.status(existingIdempotency.response_status).send(existingIdempotency.response_body);
      }

      const data = CreateTransferSchema.parse(request.body);
      
      if (data.source_account_id === data.destination_account_id) {
        throw new Error('SAME_ACCOUNT_TRANSFER');
      }

      // Start transaction
      const transfer = await db.transaction().execute(async (trx) => {
        // Double-check idempotency key inside the transaction with a lock to prevent concurrent requests 
        // with the same idempotency key from proceeding. We don't want two concurrent transfers.
        // Wait, Postgres doesn't lock on non-existent rows unless it's a serializable transaction or we insert.
        // So we can blindly insert or just proceed. For now, since it's an educational project,
        // we can proceed with a simple flow, but to be robust, we insert the idempotency key *at the end* of the transaction.
        // Or we can rely on standard transaction boundaries.

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

        // 5. Insert outbox event for the transfer
        await trx
          .insertInto('outbox_events')
          .values({
            aggregate_type: 'TRANSFER',
            aggregate_id: transferRecord.id,
            event_type: 'transfer.completed',
            payload: JSON.stringify(transferRecord),
            status: 'PENDING',
          })
          .execute();

        // 6. Store idempotency key
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

      return reply.status(201).send(transfer);
    } catch (error: any) {
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

      let status = 500;
      let body: any = { error: 'Internal Server Error' };

      if (error instanceof z.ZodError) {
        status = 400;
        body = { error: 'Bad Request', issues: error.issues };
      } else if (error.message === 'INSUFFICIENT_FUNDS') {
        status = 400;
        body = { error: 'Bad Request', message: 'Insufficient funds' };
      } else if (error.message === 'SOURCE_NOT_FOUND' || error.message === 'DESTINATION_NOT_FOUND') {
        status = 400;
        body = { error: 'Bad Request', message: 'Account not found' };
      } else if (error.message === 'CURRENCY_MISMATCH') {
        status = 400;
        body = { error: 'Bad Request', message: 'Currency mismatch' };
      } else if (error.message === 'SAME_ACCOUNT_TRANSFER') {
        status = 400;
        body = { error: 'Bad Request', message: 'Cannot transfer to the same account' };
      } else if (error.code === '23505' && error.constraint === 'idempotency_keys_pkey') {
        // Concurrent request won the race. Fetch and return its response.
        const existing = await db
          .selectFrom('idempotency_keys')
          .select(['response_status', 'response_body'])
          .where('key', '=', idempotencyKey!)
          .executeTakeFirst();
          
        if (existing) {
          return reply.status(existing.response_status).send(existing.response_body);
        }
        // If it somehow disappeared, just fall through to 500
      } else {
        fastify.log.error(error);
      }

      // If we failed with a client error, save it so retries get the same error
      if (idempotencyKey && status >= 400 && status < 500) {
        try {
          await db.insertInto('idempotency_keys')
            .values({
              key: idempotencyKey,
              response_status: status,
              response_body: JSON.stringify(body),
            })
            .execute();
        } catch (e) {
          fastify.log.error(e, 'Failed to save idempotency key on error');
        }
      }

      return reply.status(status).send(body);
    }
  });
};
