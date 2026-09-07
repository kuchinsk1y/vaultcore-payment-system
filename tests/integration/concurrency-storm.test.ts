import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { signJwt } from '../../src/infrastructure/middleware/jwt-auth';
import { db } from '../../src/infrastructure/database';
import { closeRedisConnection } from '../../src/infrastructure/redis/redis.client';
import crypto from 'node:crypto';
import { sql } from 'kysely';

describe('Concurrency Storm Test', () => {
  let sourceAccountId: string;
  let destinationAccountId: string;
  let userId: string;

  beforeAll(async () => {
    await fastify.ready();

    // Create a dummy user
    const [user] = await db
      .insertInto('users')
      .values({ email: `storm-${crypto.randomUUID()}@example.com` })
      .returning('id')
      .execute();

    userId = user.id;

    // Create source and destination accounts
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

    // Seed the source account with some initial balance via a direct ledger insert
    const [ledgerTx] = await db.insertInto('ledger_transactions')
      .values({ description: 'Initial deposit for storm test' })
      .returning('id')
      .execute();
      
    await db.insertInto('ledger_entries')
      .values([
        {
          ledger_transaction_id: ledgerTx.id,
          account_id: sourceAccountId,
          direction: 'CREDIT',
          amount: 10000, // 100 EUR
          currency: 'EUR'
        }
      ])
      .execute();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
    await closeRedisConnection();
  });

  it('should process 30 concurrent transfer requests correctly without lost updates or deadlocks', async () => {
    const numRequests = 30;
    const transferAmount = 10;
    
    // Create an array of promises firing concurrently
    const requests = Array.from({ length: numRequests }).map(async (_, index) => {
      return fastify.inject({
        method: 'POST',
        url: '/transfers',
        // Simulate different IPs to bypass the 10 req/min/IP rate limiter
        remoteAddress: `192.168.2.${10 + index}`, 
        headers: {
          'idempotency-key': crypto.randomUUID(), // Unique idempotency key for each request
          'authorization': `Bearer ${signJwt(userId)}`, // Ensure auth passes
        },
        payload: {
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount: transferAmount,
          currency: 'EUR',
        },
      });
    });

    // Fire all requests simultaneously
    const responses = await Promise.all(requests);

    let successCount = 0;
    let otherErrorCount = 0;

    for (const response of responses) {
      if (response.statusCode === 201) {
        successCount++;
      } else {
        otherErrorCount++;
        console.error(`Unexpected status ${response.statusCode}: ${response.payload}`);
      }
    }

    // All 30 requests should succeed since we have sufficient funds and bypassed rate limits
    expect(successCount).toBe(numRequests);
    expect(otherErrorCount).toBe(0);

    // Verify final balances dynamically from the ledger
    const sourceBalanceResult = await db
      .selectFrom('ledger_entries')
      .select((eb) =>
        eb.fn.coalesce(
          eb.fn.sum<number>(
            sql<number>`CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END`
          ),
          sql<number>`0`
        ).as('balance')
      )
      .where('account_id', '=', sourceAccountId)
      .executeTakeFirst();
      
    const expectedRemainingBalance = 10000 - (numRequests * transferAmount);
    expect(String(sourceBalanceResult?.balance)).toBe(String(expectedRemainingBalance));
    
    const destBalanceResult = await db
      .selectFrom('ledger_entries')
      .select((eb) =>
        eb.fn.coalesce(
          eb.fn.sum<number>(
            sql<number>`CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END`
          ),
          sql<number>`0`
        ).as('balance')
      )
      .where('account_id', '=', destinationAccountId)
      .executeTakeFirst();

    const expectedDestBalance = numRequests * transferAmount;
    expect(String(destBalanceResult?.balance)).toBe(String(expectedDestBalance));
  });
});
