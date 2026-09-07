import Fastify from 'fastify';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { db, checkDatabaseConnection } from '../../src/infrastructure/database';
import { userRoutes } from '../../src/modules/users/users.routes';
import { accountRoutes } from '../../src/modules/accounts/accounts.routes';
import { transferRoutes } from '../../src/modules/transfers/transfers.routes';

dotenv.config();

const fastify = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id',
  genReqId: (req) => {
    return (req.headers['x-request-id'] as string) || crypto.randomUUID();
  }
});

// Automatically append X-Request-Id to every response
fastify.addHook('onSend', async (request, reply, payload) => {
  reply.header('x-request-id', request.id);
  return payload;
});

// Minimal health endpoint that checks application process health
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Database connectivity check endpoint
fastify.get('/health/db', async (request, reply) => {
  const isDbConnected = await checkDatabaseConnection();
  if (isDbConnected) {
    return { status: 'ok', database: 'connected' };
  } else {
    reply.status(503).send({ status: 'error', database: 'disconnected' });
  }
});

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
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
      }
    };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ status: 'error', message: 'Failed to fetch metrics' });
  }
});

import { webhookRoutes } from '../../src/modules/webhooks/webhooks.routes';

// Register routes
fastify.register(userRoutes, { prefix: '/users' });
fastify.register(accountRoutes, { prefix: '/accounts' });
fastify.register(transferRoutes, { prefix: '/transfers' });
fastify.register(webhookRoutes, { prefix: '/webhooks' });

import { OutboxWorker } from '../../src/infrastructure/workers/outbox.worker';
import { WebhookProcessor } from '../../src/modules/webhooks/webhooks.processor';

const start = async () => {
  let outboxWorker: OutboxWorker;
  let webhookProcessor: WebhookProcessor;
  
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${port}`);

    // Start background workers
    outboxWorker = new OutboxWorker(fastify.log);
    outboxWorker.start();
    
    webhookProcessor = new WebhookProcessor(fastify.log);
    webhookProcessor.start();
    
    // Graceful shutdown hook
    fastify.addHook('onClose', async () => {
      outboxWorker.stop();
      webhookProcessor.stop();
    });
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if this file is run directly (not imported in tests)
if (require.main === module) {
  start();
}

export { fastify };
