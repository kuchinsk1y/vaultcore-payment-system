import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

import { AccountsService } from './accounts.service';
import { TopUpError, TopUpService, topUpConfig } from './topup.service';
import { createRateLimiter } from '../../infrastructure/middleware/rate-limiter';
import { AuditService } from '../audit/audit.service';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';

const CreateAccountSchema = z.object({
  currency: z.string().length(3).transform((c) => c.toUpperCase()),
});

const TopUpSchema = z.object({
  amount: z.number().int().positive(), // minor units
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
        .where('a.status', '=', 'ACTIVE')
        .groupBy('a.id')
        .execute();

      const accounts = accountsRows.map(row => ({
        ...row,
        balance: Number(row.balance) / 100
      }));

      return reply.send(accounts);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/directory', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const otherAccountsRows = await db.selectFrom('accounts as a')
        .innerJoin('users as u', 'a.user_id', 'u.id')
        .select([
          'a.id as account_id',
          'a.currency',
          'u.full_name',
          'u.email'
        ])
        .where('a.user_id', '!=', request.userId)
        .where('a.status', '=', 'ACTIVE')
        .execute();

      return reply.send(otherAccountsRows);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /** Currencies an account can be opened in, plus the demo top-up rules (so the UI never guesses). */
  fastify.get('/options', { preHandler: [verifyJwt] }, async (_request, reply) => {
    return reply.send({
      currencies: await AccountsService.supportedCurrencies(),
      top_up: {
        enabled: topUpConfig.enabled,
        max_per_request: topUpConfig.maxPerRequest,
        max_per_24h: topUpConfig.maxPer24Hours,
      },
    });
  });

  const topUpLimiter = createRateLimiter(10, 60);

  fastify.post('/:id/top-up', { preHandler: [verifyJwt, topUpLimiter] }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { amount } = TopUpSchema.parse(request.body);

      const result = await TopUpService.topUp(request.userId, id, amount);
      await AuditService.log({
        userId: request.userId,
        action: 'account.topped_up',
        metadata: { accountId: id, amount, currency: result.currency },
        request,
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      if (error instanceof TopUpError) {
        return reply.status(error.status).send({ error: error.code, code: error.code, message: error.message, ...error.extra });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const data = CreateAccountSchema.parse(request.body);

      const supported = await AccountsService.supportedCurrencies();
      if (!supported.includes(data.currency)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Unsupported currency. Available: ${supported.join(', ')}`,
        });
      }

      const existingAccount = await db.selectFrom('accounts')
        .select('id')
        .where('user_id', '=', request.userId)
        .where('currency', '=', data.currency)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();
        
      if (existingAccount) {
        return reply.status(409).send({ error: 'Conflict', message: `You already have an active ${data.currency} account.` });
      }

      const [account] = await db.insertInto('accounts')
        .values({
          user_id: request.userId,
          currency: data.currency,
        })
        .returning(['id', 'user_id', 'currency', 'status', 'created_at'])
        .execute();
        
      await AuditService.log({ userId: request.userId, action: 'account.created', metadata: { accountId: account.id, currency: data.currency }, request });
      return reply.status(201).send(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.patch('/:id/close', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await AccountsService.closeAccount(request.userId, id);

      switch (result) {
        case 'NOT_FOUND':
          return reply.status(404).send({ error: 'Not Found', message: 'Account not found' });
        case 'ALREADY_CLOSED':
          return reply.status(400).send({ error: 'Bad Request', message: 'Account is already closed' });
        case 'NON_ZERO_BALANCE':
          return reply.status(400).send({ error: 'Bad Request', message: 'Balance must be 0 to close account' });
        default:
          await AuditService.log({ userId: request.userId, action: 'account.closed', metadata: { accountId: id }, request });
          return reply.send({ success: true, message: 'Account closed' });
      }
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/:id/ledger', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const entries = await AccountsService.getLedger(request.userId, id);

      if (!entries) {
        return reply.status(404).send({ error: 'Not Found', message: 'Account not found' });
      }
      return reply.send(entries);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
