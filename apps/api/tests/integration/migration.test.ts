import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../../src/infrastructure/database';
import { seedSystemData } from '../helpers/seed';
import { sql } from 'kysely';
import { exec } from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(exec);

describe('Database Migrations and Schema', () => {
  beforeAll(async () => {
    // Run migrations before tests
    await execAsync('npm run db:migrate', { cwd: process.cwd() });
    
    // Clear out tables for a clean slate, in case it was run before
    await sql`TRUNCATE TABLE accounts, users CASCADE`.execute(db);
    await seedSystemData();
  });

  afterAll(async () => {
    // We don't destroy the db pool here if other tests use it, 
    // but typically each file has its own process in vitest so it's fine.
    // However, the database connection check test might be running concurrently 
    // or sequentially. Vitest runs files in parallel by default.
    // So we just rely on vitest teardown or we can destroy if it's the last thing.
    // To be safe and clean, we won't destroy the global pool here because `database.test.ts` uses it.
    // Wait, vitest isolates files, so destroying the pool in this file's context is correct.
    await db.destroy();
  });

  it('should successfully insert a user and an account', async () => {
    // Insert user
    const [user] = await db.insertInto('users')
      .values({ email: 'test@example.com' })
      .returning('id')
      .execute();

    expect(user.id).toBeDefined();

    // Insert account
    const [account] = await db.insertInto('accounts')
      .values({
        user_id: user.id,
        currency: 'USD',
      })
      .returning(['id', 'status', 'created_at'])
      .execute();

    expect(account.id).toBeDefined();
    expect(account.status).toBe('ACTIVE');
    expect(account.created_at).toBeInstanceOf(Date);
  });

  it('should fail to insert an account with a non-existent user_id', async () => {
    // We expect this to throw a foreign key constraint error
    await expect(
      db.insertInto('accounts')
        .values({
          user_id: crypto.randomUUID(), // A user that does not exist
          currency: 'EUR',
        })
        .execute()
    ).rejects.toThrow(/foreign key constraint/i);
  });
});
