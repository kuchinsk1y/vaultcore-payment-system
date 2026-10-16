import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database';
import { OutboxWorker } from '../../src/modules/outbox/outbox.worker';
import { sql } from 'kysely';
import fastify from 'fastify';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

describe('Outbox Webhook Dispatcher', () => {
  const webhookServer = fastify();
  const receivedWebhooks: any[] = [];
  let worker: OutboxWorker;
  let serverPort = 0;

  beforeAll(async () => {
    // Start a mock webhook server
    webhookServer.post('/webhook', async (request, reply) => {
      receivedWebhooks.push(request.body);
      return reply.status(200).send({ ok: true });
    });

    const address = await webhookServer.listen({ port: 0, host: '127.0.0.1' });
    serverPort = (webhookServer.server.address() as any).port;
    process.env.WEBHOOK_TARGET_URL = `http://127.0.0.1:${serverPort}/webhook`;

    // Apply migrations if needed, but integration tests usually do it globally.
    // Ensure our new columns exist.
    await execAsync('npm run db:migrate', { cwd: process.cwd() });
    
    // Clean up
    await sql`TRUNCATE TABLE outbox_events CASCADE`.execute(db);

    worker = new OutboxWorker(console, 100, 3);
  });

  afterAll(async () => {
    await webhookServer.close();
    worker.stop();
  });

  it('should process pending outbox events and send webhooks', async () => {
    // 1. Insert a pending event directly
    const [event] = await db
      .insertInto('outbox_events')
      .values({
        aggregate_type: 'TEST',
        aggregate_id: '00000000-0000-0000-0000-000000000000',
        event_type: 'test.event',
        payload: JSON.stringify({ hello: 'world' }),
        status: 'PENDING',
        attempts: 0,
      })
      .returningAll()
      .execute();
      
    if (!event || !event.id) throw new Error('Failed to insert event');

    // 2. Run the worker batch process
    const processed = await worker.processBatch();
    expect(processed).toBeGreaterThan(0);

    // 3. Verify webhook was received
    expect(receivedWebhooks.length).toBeGreaterThan(0);
    const lastWebhook = receivedWebhooks[receivedWebhooks.length - 1];
    expect(lastWebhook.type).toBe('test.event');
    expect(lastWebhook.data.hello).toBe('world');

    // 4. Verify DB status is COMPLETED
    const dbEvent = await db
      .selectFrom('outbox_events')
      .selectAll()
      .where('id', '=', event.id)
      .executeTakeFirst();
      
    expect(dbEvent?.status).toBe('COMPLETED');
    expect(dbEvent?.attempts).toBe(1);
  });

  it('should increment attempts and mark as FAILED after max retries', async () => {
    // Change target URL to something broken
    process.env.WEBHOOK_TARGET_URL = `http://127.0.0.1:${serverPort}/broken`;
    
    // We recreate the worker so it picks up the new URL
    const failingWorker = new OutboxWorker(console, 100, 2);

    const [event] = await db
      .insertInto('outbox_events')
      .values({
        aggregate_type: 'TEST_FAIL',
        aggregate_id: '00000000-0000-0000-0000-000000000000',
        event_type: 'test.fail',
        payload: JSON.stringify({ should: 'fail' }),
        status: 'PENDING',
        attempts: 0,
      })
      .returningAll()
      .execute();
      
    if (!event || !event.id) throw new Error('Failed to insert event');

    // 1st attempt (fails)
    await failingWorker.processBatch();
    
    let dbEvent = await db.selectFrom('outbox_events').selectAll().where('id', '=', event.id).executeTakeFirst();
    expect(dbEvent?.status).toBe('PENDING');
    expect(dbEvent?.attempts).toBe(1);

    // 2nd attempt (fails, max retries = 2)
    await failingWorker.processBatch();

    dbEvent = await db.selectFrom('outbox_events').selectAll().where('id', '=', event.id).executeTakeFirst();
    expect(dbEvent?.status).toBe('FAILED');
    expect(dbEvent?.attempts).toBe(2);
  });
});
