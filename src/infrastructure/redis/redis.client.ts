import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Export a singleton Redis instance
export const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
});

export const closeRedisConnection = async () => {
  await redis.quit();
};
