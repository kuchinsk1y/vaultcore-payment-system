import Fastify from 'fastify';
import dotenv from 'dotenv';
import { checkDatabaseConnection } from '../../src/infrastructure/database';
import { userRoutes } from '../../src/modules/users/users.routes';
import { accountRoutes } from '../../src/modules/accounts/accounts.routes';
import { transferRoutes } from '../../src/modules/transfers/transfers.routes';

dotenv.config();

const fastify = Fastify({
  logger: true,
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

// Register routes
fastify.register(userRoutes, { prefix: '/users' });
fastify.register(accountRoutes, { prefix: '/accounts' });
fastify.register(transferRoutes, { prefix: '/transfers' });

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${port}`);
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
