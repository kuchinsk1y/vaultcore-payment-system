import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import { OutboxWorker } from '../../src/infrastructure/workers/outbox.worker';
import crypto from 'node:crypto';

describe('OutboxWorker API', () => {
  let worker: OutboxWorker;

  beforeAll(async () => {
    // Clean up DB outbox events before tests
    await sql`TRUNCATE TABLE outbox_events CASCADE`.execute(db);

    // Provide a dummy logger to the worker for quiet tests
    const dummyLogger = {
      info: () => {},
      error: console.error,
    };
    worker = new OutboxWorker(dummyLogger, 1000);
  });

  afterAll(async () => {
    worker.stop();
    await db.destroy();
  });

  it('should pick up PENDING outbox events and process them', async () => {
    // 1. Insert a pending event manually
    const aggregateId = crypto.randomUUID();
    const [event] = await db
      .insertInto('outbox_events')
      .values({
        aggregate_type: 'TEST_AGGREGATE',
        aggregate_id: aggregateId,
        event_type: 'test.event',
        payload: JSON.stringify({ key: 'value' }),
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    expect(event.status).toBe('PENDING');
    expect(event.processed_at).toBeNull();

    // 2. Run the worker batch process manually once
    const processedCount = await worker.processBatch();

    // Verify it processed 1 event
    expect(processedCount).toBe(1);

    // 3. Assert the event status has changed to 'PROCESSED'
    const updatedEvent = await db
      .selectFrom('outbox_events')
      .selectAll()
      .where('id', '=', event.id)
      .executeTakeFirst();

    expect(updatedEvent).toBeDefined();
    expect(updatedEvent?.status).toBe('PROCESSED');
    expect(updatedEvent?.processed_at).not.toBeNull();
  });

  it('should ignore already PROCESSED events', async () => {
    // processBatch was already called. It shouldn't pick up the processed event again.
    const processedCount = await worker.processBatch();
    expect(processedCount).toBe(0);
  });
});
