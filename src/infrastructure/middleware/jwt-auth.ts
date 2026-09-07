import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-default-secret-key';

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    request.userId = decoded.userId;
  } catch (error) {
    request.log.warn({ err: error }, 'Invalid JWT signature');
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    return;
  }
}

export function signJwt(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1d' });
}
