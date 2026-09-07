import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../redis/redis.client';

export const createRateLimiter = (maxRequests: number, windowSeconds: number) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Determine a unique key for the client. E.g., by IP address.
    const clientIp = request.ip || '127.0.0.1';
    // Incorporate the route path into the key so rate limits are route-specific
    const key = `rate-limit:${request.url}:${clientIp}`;

    try {
      // Use Redis INCR and EXPIRE for a simple fixed window counter
      const currentCount = await redis.incr(key);
      
      // If this is the first request in the window, set the expiration
      if (currentCount === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (currentCount > maxRequests) {
        request.log.warn(`Rate limit exceeded for IP: ${clientIp} on route ${request.url}`);
        return reply.status(429).send({
          status: 'error',
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Try again in ${windowSeconds} seconds.`,
        });
      }
    } catch (error) {
      request.log.error(error, 'Rate Limiter Redis Error');
      // If Redis goes down, we might want to fail open or fail closed. 
      // For this system, we'll fail open (allow the request) to prevent a Redis outage from taking down the core payment API.
    }
  };
};
