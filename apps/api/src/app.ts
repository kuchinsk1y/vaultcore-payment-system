import './config/env';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { allowedOrigins } from './infrastructure/middleware/jwt-auth';
import { healthRoutes } from './modules/health/health.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/users.routes';
import { accountRoutes } from './modules/accounts/accounts.routes';
import { transferRoutes } from './modules/transfers/transfers.routes';
import { webhookRoutes } from './modules/webhooks/webhooks.routes';
import { fxRoutes } from './modules/fx/fx.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { cardsRoutes } from './modules/cards/cards.routes';
import { contactsRoutes } from './modules/contacts/contacts.routes';
import { transactionsRoutes } from './modules/transactions/transactions.routes';

export const fastify = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id',
  genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
});

// Security: cookies (httpOnly session), security headers, and a strict CORS allow-list
fastify.register(cookie);
fastify.register(helmet);
fastify.register(cors, {
  origin: (origin, cb) => {
    // Non-browser clients (no Origin header) and same-origin proxied requests are allowed through
    if (!origin || allowedOrigins().includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
});

// Automatically append X-Request-Id to every response
fastify.addHook('onSend', async (request, reply, payload) => {
  reply.header('x-request-id', request.id);
  return payload;
});

fastify.register(healthRoutes);
fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(userRoutes, { prefix: '/users' });
fastify.register(accountRoutes, { prefix: '/accounts' });
fastify.register(transferRoutes, { prefix: '/transfers' });
fastify.register(webhookRoutes, { prefix: '/webhooks' });
fastify.register(fxRoutes, { prefix: '/fx' });
fastify.register(analyticsRoutes, { prefix: '/analytics' });
fastify.register(cardsRoutes, { prefix: '/cards' });
fastify.register(contactsRoutes, { prefix: '/contacts' });
fastify.register(transactionsRoutes, { prefix: '/transactions' });
