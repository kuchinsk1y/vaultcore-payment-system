import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../infrastructure/database';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';
import bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { randomInt } from 'node:crypto';

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
      const userId = request.userId;
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
      const lastFour = randomInt(1000, 10000).toString();

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

      await AuditService.log({ userId, action: 'card.issued', metadata: { cardId: newCard.id, accountId: account_id }, request });
      return reply.status(201).send({ status: 'success', data: newCard });
    }
  );

  // GET /api/cards - List all cards
  fastify.get(
    '/',
    async (request, reply) => {
      const userId = request.userId;

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
      const userId = request.userId;
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

      await AuditService.log({ userId, action: 'card.frozen', metadata: { cardId: card.id }, request });
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
      const userId = request.userId;
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

      await AuditService.log({ userId, action: 'card.unfrozen', metadata: { cardId: card.id }, request });
      return reply.send({ status: 'success', data: card });
    }
  );

  // POST /api/cards/:id/pin
  fastify.post(
    '/:id/pin',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } }
        },
        body: {
          type: 'object',
          required: ['pin'],
          properties: { pin: { type: 'string', minLength: 4, maxLength: 6 } }
        }
      },
    },
    async (request, reply) => {
      const userId = request.userId;
      const { id } = request.params as { id: string };
      const { pin } = request.body as { pin: string };

      const pinHash = await bcrypt.hash(pin, 10);

      const card = await db
        .updateTable('cards')
        .set({ pin_hash: pinHash })
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returning(['id', 'status'])
        .executeTakeFirst();

      if (!card) {
        return reply.status(404).send({ status: 'error', message: 'Card not found' });
      }

      await AuditService.log({ userId, action: 'card.pin_changed', metadata: { cardId: (request.params as { id: string }).id }, request });
      return reply.send({ status: 'success', message: 'PIN updated successfully' });
    }
  );

  // POST /api/cards/:id/verify-pin
  fastify.post(
    '/:id/verify-pin',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } }
        },
        body: {
          type: 'object',
          required: ['pin'],
          properties: { pin: { type: 'string' } }
        }
      },
    },
    async (request, reply) => {
      const userId = request.userId;
      const { id } = request.params as { id: string };
      const { pin } = request.body as { pin: string };

      const card = await db
        .selectFrom('cards')
        .select(['pin_hash'])
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!card) {
        return reply.status(404).send({ status: 'error', message: 'Card not found' });
      }

      if (!card.pin_hash) {
        return reply.status(400).send({ status: 'error', message: 'PIN not set for this card' });
      }

      const isValid = await bcrypt.compare(pin, card.pin_hash);

      if (!isValid) {
        return reply.status(401).send({ status: 'error', message: 'Invalid PIN' });
      }

      return reply.send({ status: 'success', message: 'PIN verified' });
    }
  );
};
