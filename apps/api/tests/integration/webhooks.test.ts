import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../src/app';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(exec);

describe('Webhooks API', () => {
  beforeAll(async () => {
    // Run migrations before tests
    await execAsync('npm run db:migrate', { cwd: process.cwd() });
    
    await fastify.ready();
    
    // Clean up DB before tests
    await sql`TRUNCATE TABLE webhook_events CASCADE`.execute(db);
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  it('should successfully receive and save a new webhook event', async () => {
    const providerEventId = crypto.randomUUID();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/provider',
      payload: {
        provider_event_id: providerEventId,
        event_type: 'payment.succeeded',
        payload: {
          charge_id: 'ch_123',
          amount: 1000,
          currency: 'EUR'
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('RECEIVED');

    // Verify it was saved in DB
    const webhookEvent = await db
      .selectFrom('webhook_events')
      .selectAll()
      .where('provider_event_id', '=', providerEventId)
      .executeTakeFirst();
      
    expect(webhookEvent).toBeDefined();
    expect(webhookEvent?.status).toBe('RECEIVED');
    expect(webhookEvent?.event_type).toBe('payment.succeeded');
  });

  it('should return 200 ALREADY_PROCESSED for a duplicate webhook', async () => {
    const providerEventId = crypto.randomUUID();
    const payload = {
      provider_event_id: providerEventId,
      event_type: 'payment.failed',
      payload: {
        charge_id: 'ch_456',
        reason: 'insufficient_funds'
      },
    };

    // First request
    const response1 = await fastify.inject({
      method: 'POST',
      url: '/webhooks/provider',
      payload,
    });

    expect(response1.statusCode).toBe(200);
    expect(JSON.parse(response1.payload).status).toBe('RECEIVED');

    // Second request (Duplicate)
    const response2 = await fastify.inject({
      method: 'POST',
      url: '/webhooks/provider',
      payload,
    });

    expect(response2.statusCode).toBe(200);
    expect(JSON.parse(response2.payload).status).toBe('ALREADY_PROCESSED');
    
    // Ensure only one row exists
    const events = await db
      .selectFrom('webhook_events')
      .selectAll()
      .where('provider_event_id', '=', providerEventId)
      .execute();
      
    expect(events.length).toBe(1);
  });
  
  it('should return 400 for invalid payload', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhooks/provider',
      payload: {
        // missing provider_event_id and event_type
        payload: {},
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
