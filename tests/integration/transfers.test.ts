import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import { exec } from 'node:child_process';
import util from 'node:util';
import crypto from 'node:crypto';

const execAsync = util.promisify(exec);

async function getAccountBalance(accountId: string) {
  const result = await db
    .selectFrom('ledger_entries')
    .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
    .where('account_id', '=', accountId)
    .executeTakeFirst();
    
  return result?.balance || '0';
}

describe('Transfers API with Idempotency', () => {
  let userId: string;
  let sourceAccountId: string;
  let destAccountId: string;

  beforeAll(async () => {
    // Run migrations before tests
    await execAsync('npm run db:migrate', { cwd: process.cwd() });
    
    await fastify.ready();
    
    // Clean up DB before tests
    await sql`TRUNCATE TABLE transfers, ledger_entries, ledger_transactions, accounts, users, idempotency_keys, outbox_events CASCADE`.execute(db);

    // Setup initial data
    const [user] = await db.insertInto('users')
      .values({ email: 'transfer-test-idempotency@example.com' })
      .returning('id')
      .execute();
    userId = user.id;

    const [source] = await db.insertInto('accounts')
      .values({
        user_id: userId,
        currency: 'EUR',
      })
      .returning('id')
      .execute();
    sourceAccountId = source.id;

    const [dest] = await db.insertInto('accounts')
      .values({
        user_id: userId,
        currency: 'EUR',
      })
      .returning('id')
      .execute();
    destAccountId = dest.id;

    // Insert initial funds via ledger
    const [initialTx] = await db.insertInto('ledger_transactions')
      .values({ description: 'Initial Deposit' })
      .returning('id')
      .execute();

    await db.insertInto('ledger_entries')
      .values([
        {
          ledger_transaction_id: initialTx.id,
          account_id: sourceAccountId,
          direction: 'CREDIT',
          amount: 2000,
          currency: 'EUR',
        },
        {
          ledger_transaction_id: initialTx.id,
          account_id: destAccountId,
          direction: 'CREDIT',
          amount: 500,
          currency: 'EUR',
        }
      ])
      .execute();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  it('should successfully transfer funds with idempotency key', async () => {
    const idempotencyKey = crypto.randomUUID();

    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': idempotencyKey,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 300,
        currency: 'EUR',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('SUCCESS');
    expect(String(body.amount)).toBe('300');

    // Verify balances via ledger
    const sourceBalance = await getAccountBalance(sourceAccountId);
    const destBalance = await getAccountBalance(destAccountId);

    // source had 2000, transferred 300 -> 1700
    // dest had 500, received 300 -> 800
    expect(String(sourceBalance)).toBe('1700');
    expect(String(destBalance)).toBe('800');

    // Verify outbox event was created
    const outboxEvent = await db
      .selectFrom('outbox_events')
      .selectAll()
      .where('aggregate_id', '=', body.id)
      .executeTakeFirst();
      
    expect(outboxEvent).toBeDefined();
    expect(outboxEvent?.aggregate_type).toBe('TRANSFER');
    expect(outboxEvent?.event_type).toBe('transfer.completed');
    expect(outboxEvent?.status).toBe('PENDING');
  });

  it('should return exactly the same response on retry with same idempotency key, without deducting balance twice', async () => {
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      source_account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 200,
      currency: 'EUR',
    };

    // First request
    const response1 = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });

    expect(response1.statusCode).toBe(201);
    const body1 = JSON.parse(response1.payload);

    const balanceAfterFirst = await getAccountBalance(sourceAccountId);
    expect(String(balanceAfterFirst)).toBe('1500'); // 1700 - 200

    // Second request (Retry)
    const response2 = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });

    expect(response2.statusCode).toBe(201);
    const body2 = JSON.parse(response2.payload);

    // Response body should match exactly (e.g. same transfer ID)
    expect(body2).toEqual(body1);

    // Balance should remain unchanged (not deducted a second time)
    const balanceAfterSecond = await getAccountBalance(sourceAccountId);
    expect(String(balanceAfterSecond)).toBe('1500');
  });

  it('should fail if missing idempotency key', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 100,
        currency: 'EUR',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message).toBe('Missing Idempotency-Key header');
  });

  it('should save error responses in idempotency store and return same on retry', async () => {
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      source_account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 5000, // Insufficient funds
      currency: 'EUR',
    };

    // First request
    const response1 = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });

    expect(response1.statusCode).toBe(400);
    const body1 = JSON.parse(response1.payload);
    expect(body1.message).toBe('Insufficient funds');

    // Second request (Retry)
    const response2 = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });

    expect(response2.statusCode).toBe(400);
    const body2 = JSON.parse(response2.payload);

    expect(body2).toEqual(body1);
  });
});
