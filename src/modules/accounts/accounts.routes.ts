import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';

const CreateAccountSchema = z.object({
  currency: z.string().length(3),
});

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const accountsRows = await db.selectFrom('accounts as a')
        .leftJoin('ledger_entries as le', 'a.id', 'le.account_id')
        .select([
          'a.id',
          'a.user_id',
          'a.currency',
          'a.status',
          'a.created_at',
          db.fn.coalesce(
            sql<string>`SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)`, 
            sql<string>`'0'`
          ).as('balance')
        ])
        .where('a.user_id', '=', request.userId)
        .groupBy('a.id')
        .execute();

      const accounts = accountsRows.map(row => ({
        ...row,
        balance: Number(row.balance)
      }));

      return reply.send(accounts);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const data = CreateAccountSchema.parse(request.body);
      
      const [account] = await db.insertInto('accounts')
        .values({
          user_id: request.userId,
          currency: data.currency,
        })
        .returning(['id', 'user_id', 'currency', 'status', 'created_at'])
        .execute();
        
      return reply.status(201).send(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
