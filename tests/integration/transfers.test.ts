import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';
import { exec } from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(exec);

async function getAccountBalance(accountId: string) {
  const result = await db
    .selectFrom('ledger_entries')
    .select(sql<string>`SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)`.as('balance'))
    .where('account_id', '=', accountId)
    .executeTakeFirst();
    
  return result?.balance || '0';
}

describe('Transfers API with Ledger', () => {
  let userId: string;
  let sourceAccountId: string;
  let destAccountId: string;

  beforeAll(async () => {
    // Run migrations before tests
    await execAsync('npm run db:migrate', { cwd: process.cwd() });
    
    await fastify.ready();
    
    // Clean up DB before tests
    await sql`TRUNCATE TABLE transfers, ledger_entries, ledger_transactions, accounts, users CASCADE`.execute(db);

    // Setup initial data
    const [user] = await db.insertInto('users')
      .values({ email: 'transfer-test-ledger@example.com' })
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
          amount: 1000,
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

  it('should successfully transfer funds between accounts', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
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

    // source had 1000, transferred 300 -> 700
    // dest had 500, received 300 -> 800
    expect(String(sourceBalance)).toBe('700');
    expect(String(destBalance)).toBe('800');
  });

  it('should fail if source account has insufficient funds', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      payload: {
        source_account_id: sourceAccountId,
        destination_account_id: destAccountId,
        amount: 2000, // source only has 700 now
        currency: 'EUR',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.message).toBe('Insufficient funds');

    // Verify balances remain unchanged
    const sourceBalance = await getAccountBalance(sourceAccountId);
    const destBalance = await getAccountBalance(destAccountId);

    expect(String(sourceBalance)).toBe('700');
    expect(String(destBalance)).toBe('800');
  });
});
