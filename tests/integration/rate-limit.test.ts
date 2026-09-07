import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { db } from '../../src/infrastructure/database';
import { redis, closeRedisConnection } from '../../src/infrastructure/redis/redis.client';
import crypto from 'node:crypto';

describe('Rate Limiter Middleware', () => {
  let sourceAccountId: string;
  let destinationAccountId: string;

  beforeAll(async () => {
    await fastify.ready();

    // Create a dummy user and accounts for the transfer requests
    const [user] = await db
      .insertInto('users')
      .values({ email: `rate-limit-${crypto.randomUUID()}@example.com` })
      .returning('id')
      .execute();

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

  it('should allow requests within the rate limit and block when exceeded', async () => {
    // The limit is 10 requests per 60 seconds
    const maxRequests = 10;
    let allowedCount = 0;
    
    // Send 10 valid requests
    for (let i = 0; i < maxRequests; i++) {
      const response = await fastify.inject({
        method: 'POST',
        url: '/transfers',
        // Mock a specific IP for this test to avoid conflicting with other tests
        remoteAddress: '192.168.1.100', 
        headers: {
          'idempotency-key': crypto.randomUUID(), // Prevent idempotency from caching
          'authorization': 'Bearer test-api-key',
        },
        payload: {
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount: 10, // Small amount
          currency: 'EUR',
        },
      });

      // It might fail due to insufficient funds (400), but that means it bypassed the rate limiter!
      if (response.statusCode === 400 || response.statusCode === 201) {
        allowedCount++;
      } else {
         console.log(response.payload);
      }
    }

    expect(allowedCount).toBe(maxRequests);

    // The 11th request should be blocked with 429 Too Many Requests
    const blockedResponse = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      remoteAddress: '192.168.1.100',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': 'Bearer test-api-key',
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount: 10,
        currency: 'EUR',
      },
    });

    expect(blockedResponse.statusCode).toBe(429);
    
    const body = JSON.parse(blockedResponse.payload);
    expect(body.status).toBe('error');
    expect(body.code).toBe('TOO_MANY_REQUESTS');
  });
});
