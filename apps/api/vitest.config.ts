import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests TRUNCATE tables, so they must never run against the development database.
// They always use a dedicated database whose name ends with "_test".
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://paycore:password@localhost:5432/paycore_test';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    env: {
      LOGIN_RATE_LIMIT: '1000',
      REFRESH_REUSE_GRACE_SECONDS: '0',
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
