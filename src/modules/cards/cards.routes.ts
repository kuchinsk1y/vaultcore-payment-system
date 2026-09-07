import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../infrastructure/database';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';

export const cardsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', verifyJwt);

  // POST /api/cards - Issue a new virtual card
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['account_id'],
          properties: {
            account_id: { type: 'string' },
            spending_limit: { type: 'number' },
          }
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId as string;
      const { account_id, spending_limit } = request.body as { account_id: string; spending_limit?: number };

      // Verify account ownership
      const account = await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', account_id)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!account) {
        return reply.status(404).send({ status: 'error', message: 'Account not found' });
      }

      // Generate random last_four digits
      const lastFour = Math.floor(1000 + Math.random() * 9000).toString();

      const newCard = await db
        .insertInto('cards')
        .values({
          user_id: userId,
          account_id: account_id,
          card_type: 'VIRTUAL',
          last_four: lastFour,
          spending_limit: spending_limit || 0,
          status: 'ACTIVE',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return reply.status(201).send({ status: 'success', data: newCard });
    }
  );

  // GET /api/cards - List all cards
  fastify.get(
    '/',
    async (request, reply) => {
      const userId = request.userId as string;

      const cards = await db
        .selectFrom('cards')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .execute();

      return reply.send({ status: 'success', data: cards });
    }
  );

  // POST /api/cards/:id/freeze
  fastify.post(
    '/:id/freeze',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId as string;
      const { id } = request.params as { id: string };

      const card = await db
        .updateTable('cards')
        .set({ status: 'FROZEN' })
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returningAll()
        .executeTakeFirst();

      if (!card) {
        return reply.status(404).send({ status: 'error', message: 'Card not found' });
      }

      return reply.send({ status: 'success', data: card });
    }
  );

  // POST /api/cards/:id/unfreeze
  fastify.post(
    '/:id/unfreeze',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId as string;
      const { id } = request.params as { id: string };

      const card = await db
        .updateTable('cards')
        .set({ status: 'ACTIVE' })
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returningAll()
        .executeTakeFirst();

      if (!card) {
        return reply.status(404).send({ status: 'error', message: 'Card not found' });
      }

      return reply.send({ status: 'success', data: card });
    }
  );
};
