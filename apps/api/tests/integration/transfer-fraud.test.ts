import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../src/app';
import { issueTestToken } from '../helpers/auth';
import { db } from '../../src/infrastructure/database';
import { closeRedisConnection } from '../../src/infrastructure/redis/redis.client';
import crypto from 'node:crypto';
import { sql } from 'kysely';

describe('End-to-End Integration: Transfers, Ledger Consistency, and Fraud Engine', () => {
  let userId: string;
  let sourceAccountId: string;
  let destAccountId: string;

  beforeAll(async () => {
    await fastify.ready();

    // 1. Create a Test User
    const [user] = await db
      .insertInto('users')
      .values({ email: `fraud-test-${crypto.randomUUID()}@example.com`, email_verified_at: new Date() })
      .returning('id')
      .execute();
    userId = user.id;

    // 2. Create Multi-currency Accounts
    const [sourceAccount] = await db
      .insertInto('accounts')
      .values({ user_id: userId, currency: 'USD' })
      .returning('id')
      .execute();
    sourceAccountId = sourceAccount.id;

    const [destAccount] = await db
      .insertInto('accounts')
      .values({ user_id: userId, currency: 'USD' })
      .returning('id')
      .execute();
    destAccountId = destAccount.id;

    // 3. Fund Source Account directly via Ledger bypass to start with $50,000.00
    const [ledgerTx] = await db
      .insertInto('ledger_transactions')
      .values({ description: 'Initial Funding for Fraud Test' })
      .returning('id')
      .execute();

    await db
      .insertInto('ledger_entries')
      .values([
        {
          ledger_transaction_id: ledgerTx.id,
          account_id: sourceAccountId,
          direction: 'CREDIT',
          amount: 5000000, // $50,000.00
          currency: 'USD',
        }
      ])
      .execute();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
    await closeRedisConnection();
  });

  it('Test 1 (Standard Transfer & Ledger Balance): Verify valid transfer updates balances correctly', async () => {
    const payload = {
      source_account_id: sourceAccountId,
      destination_account_id: destAccountId,
      amount: 1000, // $10.00
      currency: 'USD',
    };

    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${await issueTestToken(userId)}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    
    // Check Ledger Balance
    const sourceLedger = await db
      .selectFrom('ledger_entries')
      .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
      .where('account_id', '=', sourceAccountId)
      .executeTakeFirst();
    
    expect(Number(sourceLedger?.balance)).toBe(5000000 - 1000); // $49,990.00

    const destLedger = await db
      .selectFrom('ledger_entries')
      .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
      .where('account_id', '=', destAccountId)
      .executeTakeFirst();
      
    expect(Number(destLedger?.balance)).toBe(1000); // $10.00
  });

  it('Test 2 (Fraud Velocity Check): 4th rapid request blocked within 1 minute', async () => {
    // 1st transfer was done in Test 1. Let's do 2 more to establish a high velocity (>= 3 transfers in the last minute).
    
    // 2nd transfer
    await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${await issueTestToken(userId)}`,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 100, // $1.00
        currency: 'USD',
      }
    });

    // 3rd transfer (velocity is now >= 3)
    await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${await issueTestToken(userId)}`,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 100, // $1.00
        currency: 'USD',
      }
    });

    // 4th transfer: We will make this one a large amount (> $10,000.00) 
    // to combine with the velocity penalty (50 + 40 = 90 score -> BLOCKED).
    // Note: The FraudEngine alone adds 50 for velocity and 40 for large amount.
    // > 80 is required for a hard BLOCKED response.
    const responseBlocked = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${await issueTestToken(userId)}`,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 1000001, // $10,000.01 (Triggers amount penalty + velocity penalty)
        currency: 'USD',
      }
    });

    expect(responseBlocked.statusCode).toBe(403);
    const body = JSON.parse(responseBlocked.payload);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('Transaction blocked by risk evaluation engine');
  });

  it('Test 3 (Frozen Card Guard): Attempt transfer from account linked to frozen card', async () => {
    // Create a new frozen card linked to the source account
    await db
      .insertInto('cards')
      .values({
        user_id: userId,
        account_id: sourceAccountId,
        card_type: 'VIRTUAL',
        last_four: '1234',
        status: 'FROZEN',
        spending_limit: 50000,
      })
      .execute();

    // Any transfer from this account should now be blocked (+100 risk score)
    const responseBlocked = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'authorization': `Bearer ${await issueTestToken(userId)}`,
      },
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 500, // Normal small amount
        currency: 'USD',
      }
    });

    expect(responseBlocked.statusCode).toBe(403);
    const body = JSON.parse(responseBlocked.payload);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('Transaction blocked by risk evaluation engine');
  });
});
