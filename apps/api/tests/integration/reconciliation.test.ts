import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import { ReconciliationService } from '../../src/modules/reconciliation/reconciliation.service';
import crypto from 'node:crypto';

describe('Reconciliation Service API', () => {
  let reconciliationService: ReconciliationService;

  beforeAll(async () => {
    // Clean up DB before tests
    await sql`TRUNCATE TABLE outbox_events, webhook_events CASCADE`.execute(db);

    const dummyLogger = {
      info: () => {},
      warn: () => {},
      error: console.error,
    };
    reconciliationService = new ReconciliationService(dummyLogger);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('should flag stale outbox and webhook events as FAILED', async () => {
    const thresholdMinutes = 10;
    
    // 1. Insert a stale outbox event (e.g. 15 minutes old)
    const aggregateId = crypto.randomUUID();
    const [staleOutbox] = await db
      .insertInto('outbox_events')
      .values({
        aggregate_type: 'TEST_AGGREGATE',
        aggregate_id: aggregateId,
        event_type: 'test.event',
        payload: JSON.stringify({ key: 'stale' }),
        status: 'PENDING',
        created_at: sql`now() - interval '15 minutes'`,
      })
      .returningAll()
      .execute();

    // 2. Insert a fresh outbox event (e.g. 2 minutes old) that should NOT be flagged
    const [freshOutbox] = await db
      .insertInto('outbox_events')
      .values({
        aggregate_type: 'TEST_AGGREGATE',
        aggregate_id: crypto.randomUUID(),
        event_type: 'test.event',
        payload: JSON.stringify({ key: 'fresh' }),
        status: 'PENDING',
        created_at: sql`now() - interval '2 minutes'`,
      })
      .returningAll()
      .execute();

    // 3. Insert a stale webhook event
    const [staleWebhook] = await db
      .insertInto('webhook_events')
      .values({
        provider_event_id: crypto.randomUUID(),
        event_type: 'payment.succeeded',
        payload: JSON.stringify({ key: 'stale' }),
        status: 'RECEIVED',
        created_at: sql`now() - interval '20 minutes'`,
      })
      .returningAll()
      .execute();

    // Run reconciliation
    const result = await reconciliationService.runReconciliation(thresholdMinutes);

    expect(result.outboxUpdated).toBe(1);
    expect(result.webhooksUpdated).toBe(1);

    // Assert stale outbox is FAILED
    const updatedStaleOutbox = await db
      .selectFrom('outbox_events')
      .select('status')
      .where('id', '=', staleOutbox.id)
      .executeTakeFirst();
    expect(updatedStaleOutbox?.status).toBe('FAILED');

    // Assert fresh outbox is STILL PENDING
    const updatedFreshOutbox = await db
      .selectFrom('outbox_events')
      .select('status')
      .where('id', '=', freshOutbox.id)
      .executeTakeFirst();
    expect(updatedFreshOutbox?.status).toBe('PENDING');

    // Assert stale webhook is FAILED
    const updatedStaleWebhook = await db
      .selectFrom('webhook_events')
      .select('status')
      .where('id', '=', staleWebhook.id)
      .executeTakeFirst();
    expect(updatedStaleWebhook?.status).toBe('FAILED');
  });
});
