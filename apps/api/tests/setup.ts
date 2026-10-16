import Redis from 'ioredis';
import '../src/config/env';
import { assertTestDatabase } from './test-database';

// Safety net: every test file runs against the dedicated test database only.
assertTestDatabase(process.env.DATABASE_URL);

// Rate-limit counters live in Redis and would otherwise leak between test files (and between runs).
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

try {
  await redis.connect();
  const keys = await redis.keys('rate-limit:*');
  if (keys.length > 0) await redis.del(...keys);
} catch {
  // Redis unavailable: the rate limiter fails open, so tests can still run
} finally {
  redis.disconnect();
}
