import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { assertTestDatabase } from './test-database';

const DEFAULT_URL = 'postgres://paycore:password@localhost:5432/paycore_test';

/** Creates the test database on first use (connects to the maintenance "postgres" database). */
async function ensureDatabase(url: string) {
  const target = new URL(url);
  const name = target.pathname.replace(/^\//, '');

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });

  try {
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      // Identifier cannot be parameterised; it was validated to end in "_test" and is quoted here
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } catch {
    // No access to the maintenance database (e.g. CI pre-creates it): migrations below will tell
  } finally {
    await client.end().catch(() => {});
  }
}

// Runs once per vitest run: make sure the test database exists and is fully migrated.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_URL;
  assertTestDatabase(url);

  await ensureDatabase(url);

  execSync('npx tsx scripts/migrate.ts', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
