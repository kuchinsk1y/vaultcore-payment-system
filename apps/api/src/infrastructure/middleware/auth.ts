import { FastifyRequest, FastifyReply } from 'fastify';

export const requireApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.log.warn(`Missing or malformed Authorization header from IP: ${request.ip}`);
    return reply.status(401).send({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Missing or malformed API key',
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '
  const validApiKey = process.env.API_KEY || 'test-api-key';

  if (token !== validApiKey) {
    request.log.warn(`Invalid API key from IP: ${request.ip}`);
    return reply.status(401).send({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Invalid API key',
    });
  }
};
