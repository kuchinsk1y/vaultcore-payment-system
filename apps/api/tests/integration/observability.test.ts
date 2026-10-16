import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../src/app';
import crypto from 'node:crypto';
import { db } from '../../src/infrastructure/database';

describe('Observability API', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  it('should propagate a custom X-Request-Id header', async () => {
    const customId = crypto.randomUUID();

    const response = await fastify.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customId,
      },
    });

    expect(response.statusCode).toBe(200);
    // Fastify should include the injected ID in the response
    expect(response.headers['x-request-id']).toBe(customId);
  });

  it('should generate a new X-Request-Id if none is provided', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    // Should generate a valid UUID
    expect(response.headers['x-request-id']).toBeDefined();
    expect(typeof response.headers['x-request-id']).toBe('string');
    expect((response.headers['x-request-id'] as string).length).toBe(36); // UUID length
  });

  it('should reject /metrics without an API key', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(401);
  });

  it('should return system statistics from /metrics', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${process.env.API_KEY || 'test-api-key'}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    
    expect(body.status).toBe('ok');
    expect(body.metrics).toBeDefined();
    expect(typeof body.metrics.total_accounts).toBe('number');
    expect(typeof body.metrics.pending_outbox_events).toBe('number');
  });
});
