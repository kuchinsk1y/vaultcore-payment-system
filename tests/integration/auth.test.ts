import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { signJwt } from '../../src/infrastructure/middleware/jwt-auth';
import { db } from '../../src/infrastructure/database';
import { closeRedisConnection } from '../../src/infrastructure/redis/redis.client';
import crypto from 'node:crypto';

describe('API Key Authentication Middleware', () => {
  let sourceAccountId: string;
  let destinationAccountId: string;
  let userId: string;

  beforeAll(async () => {
    await fastify.ready();

    // Create a dummy user and accounts
    const [user] = await db
      .insertInto('users')
      .values({ email: `auth-${crypto.randomUUID()}@example.com` })
      .returning('id')
      .execute();

    userId = user.id;

    const [source] = await db
      .insertInto('accounts')
      .values({ user_id: user.id, currency: 'EUR' })
      .returning('id')
      .execute();
      
    const [destination] = await db
      .insertInto('accounts')
      .values({ user_id: user.id, currency: 'EUR' })
      .returning('id')
      .execute();

    sourceAccountId = source.id;
    destinationAccountId = destination.id;
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
    await closeRedisConnection();
  });

  it('should block requests without an API key', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount: 10,
        currency: 'EUR',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Missing or invalid Authorization header');
  });

  it('should block requests with an invalid API key', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': 'Bearer invalid-key',
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount: 10,
        currency: 'EUR',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Invalid or expired token');
  });

  it('should allow requests with a valid API key', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${signJwt(userId)}`,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount: 10,
        currency: 'EUR',
      },
    });

    // We expect it to reach the controller (which returns 400 for insufficient funds or 201 for success)
    expect([201, 400]).toContain(response.statusCode);
  });
});
