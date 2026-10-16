import { FastifyPluginAsync } from 'fastify';
import { db, checkDatabaseConnection } from '../../infrastructure/database';
import { requireApiKey } from '../../infrastructure/middleware/auth';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Liveness: the process is up
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness: the database is reachable
  fastify.get('/health/db', async (_request, reply) => {
    const isDbConnected = await checkDatabaseConnection();
    if (isDbConnected) {
      return { status: 'ok', database: 'connected' };
    }
    return reply.status(503).send({ status: 'error', database: 'disconnected' });
  });

  // Internal metrics (requires the API key)
  fastify.get('/metrics', { preHandler: requireApiKey }, async (request, reply) => {
    try {
      const [accountsCount] = await db
        .selectFrom('accounts')
        .select((eb) => eb.fn.count('id').as('count'))
        .execute();

      const [pendingOutboxCount] = await db
        .selectFrom('outbox_events')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('status', '=', 'PENDING')
        .execute();

      return {
        status: 'ok',
        metrics: {
          total_accounts: Number(accountsCount.count),
          pending_outbox_events: Number(pendingOutboxCount.count),
        },
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ status: 'error', message: 'Failed to fetch metrics' });
    }
  });
};
