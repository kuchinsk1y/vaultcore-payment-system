import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../modules/security/jwt';
import { securityConfig } from '../../modules/security/security.config';
import { SessionService } from '../../modules/security/session.service';
import { db } from '../database';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    sessionId: string;
  }
}

export const SESSION_COOKIE = 'paycore_session';
export const REFRESH_COOKIE = 'paycore_refresh';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  // "/" (not "/auth"): the browser reaches the API through the web app's /api proxy prefix
  path: '/',
};

export function setSessionCookies(reply: FastifyReply, tokens: { accessToken: string; refreshToken: string }) {
  reply.setCookie(SESSION_COOKIE, tokens.accessToken, {
    ...cookieBase,
    maxAge: securityConfig.accessTokenTtlSeconds,
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieBase,
    maxAge: securityConfig.refreshTokenTtlSeconds,
  });
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

/** Rejects state-changing cookie-authenticated requests that come from an untrusted origin. */
export function hasTrustedOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  return SAFE_METHODS.has(request.method) || !origin || allowedOrigins().includes(origin);
}

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const cookieToken = request.cookies?.[SESSION_COOKIE];

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (cookieToken) {
    token = cookieToken;

    // Cookies are sent automatically by the browser, so state-changing requests must come from a
    // trusted origin (defence in depth on top of SameSite=strict).
    if (!hasTrustedOrigin(request)) {
      reply.status(403).send({ error: 'FORBIDDEN', message: 'Untrusted origin' });
      return;
    }
  }

  if (!token) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    // The session may have been revoked (logout, "log out everywhere", password reset, token theft)
    if (!(await SessionService.isActive(payload.sid, payload.userId))) {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session has been revoked' });
      return;
    }

    request.userId = payload.userId;
    request.sessionId = payload.sid;
  } catch (error) {
    request.log.warn({ err: error }, 'Invalid JWT signature');
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    return;
  }
}

/** Requires a confirmed email address; use after verifyJwt on money-moving endpoints. */
export async function requireVerifiedEmail(request: FastifyRequest, reply: FastifyReply) {
  const user = await db
    .selectFrom('users')
    .select('email_verified_at')
    .where('id', '=', request.userId)
    .executeTakeFirst();

  if (!user?.email_verified_at) {
    reply.status(403).send({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address before making transfers',
    });
  }
}
