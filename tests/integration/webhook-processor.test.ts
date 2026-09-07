import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import { WebhookProcessor } from '../../src/modules/webhooks/webhooks.processor';
import crypto from 'node:crypto';

describe('WebhookProcessor API', () => {
  let processor: WebhookProcessor;

  beforeAll(async () => {
    // Clean up DB before tests
    await sql`TRUNCATE TABLE webhook_events, accounts, users CASCADE`.execute(db);

    // Provide a dummy logger to the processor for quiet tests
    const dummyLogger = {
      info: () => {},
      error: console.error,
    };
    processor = new WebhookProcessor(dummyLogger, 1000);
  });

  afterAll(async () => {
    processor.stop();
    await db.destroy();
  });

  it('should process payment.succeeded and update account balance', async () => {
    // 1. Create a user and an account to receive the funds
    const [user] = await db
      .insertInto('users')
      .values({ email: 'webhook-user@example.com' })
      .returning('id')
      .execute();

    const [account] = await db
      .insertInto('accounts')
      .values({
        user_id: user.id,
        currency: 'EUR',
      })
      .returning('id')
      .execute();

    // 2. Insert a RECEIVED webhook event for this account
    const providerEventId = crypto.randomUUID();
    const amount = 5000; // 50.00 EUR

    const [event] = await db
      .insertInto('webhook_events')
      .values({
        provider_event_id: providerEventId,
        event_type: 'payment.succeeded',
        payload: JSON.stringify({
          account_id: account.id,
          amount,
          currency: 'EUR',
        }),
        status: 'RECEIVED',
      })
      .returningAll()
      .execute();

    expect(event.status).toBe('RECEIVED');

    // 3. Run the processor manually once
    const processedCount = await processor.processBatch();
    expect(processedCount).toBe(1);

    // 4. Assert webhook event status is PROCESSED
    const updatedEvent = await db
      .selectFrom('webhook_events')
      .selectAll()
      .where('id', '=', event.id)
      .executeTakeFirst();

    expect(updatedEvent?.status).toBe('PROCESSED');
    expect(updatedEvent?.processed_at).not.toBeNull();

    // 5. Assert the ledger correctly credited the account
    const ledger = await db
      .selectFrom('ledger_entries')
      .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
      .where('account_id', '=', account.id)
      .executeTakeFirst();

    expect(ledger?.balance).toBe(String(amount));
  });

  it('should ignore unsupported event_type and mark as PROCESSED', async () => {
    const [event] = await db
      .insertInto('webhook_events')
      .values({
        provider_event_id: crypto.randomUUID(),
        event_type: 'some.unknown.event',
        payload: JSON.stringify({ foo: 'bar' }),
        status: 'RECEIVED',
      })
      .returningAll()
      .execute();

    const processedCount = await processor.processBatch();
    expect(processedCount).toBe(1);

    const updatedEvent = await db
      .selectFrom('webhook_events')
      .selectAll()
      .where('id', '=', event.id)
      .executeTakeFirst();

    expect(updatedEvent?.status).toBe('PROCESSED');
  });
});
