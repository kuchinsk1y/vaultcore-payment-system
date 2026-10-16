import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  hasTrustedOrigin,
  setSessionCookies,
  verifyJwt,
} from '../../infrastructure/middleware/jwt-auth';
import { createRateLimiter } from '../../infrastructure/middleware/rate-limiter';
import { AuditService } from '../audit/audit.service';
import { securityConfig } from '../security/security.config';
import { SessionService } from '../security/session.service';
import { AuthError, AuthService } from './auth.service';

// bcrypt only uses the first 72 bytes, so longer passwords add no strength
const Password = z.string().min(8).max(72);
const OneTimeCode = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');

const RegisterSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: Password,
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone_number: z.string().min(1),
  country: z.string().min(1),
  city: z.string().optional(),
  zip_code: z.string().optional(),
  street: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
  totp_code: OneTimeCode.optional(),
});

const clientMeta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers['user-agent'] ?? null,
});

const sendError = (reply: FastifyReply, status: number, code: string, message: string, extra: object = {}) =>
  reply.status(status).send({ error: code, code, message, ...extra });

export async function authRoutes(fastify: FastifyInstance) {
  // Validation and domain errors become clean 4xx responses
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        code: 'BAD_REQUEST',
        message: error.issues.map((i) => i.message).join('; '),
        issues: error.issues,
      });
    }
    if (error instanceof AuthError) {
      return sendError(reply, error.status, error.code, error.message);
    }
    if ((error as { statusCode?: number }).statusCode && (error as { statusCode: number }).statusCode < 500) {
      return reply.send(error);
    }
    request.log.error(error);
    return sendError(reply, 500, 'INTERNAL_SERVER_ERROR', 'Something went wrong');
  });

  const loginLimiter = createRateLimiter(securityConfig.loginRateLimitPerMinute, 60);
  const strictLimiter = createRateLimiter(5, 60);

  // ---- Registration, login, session lifecycle ---------------------------------------------

  fastify.post('/register', { preHandler: loginLimiter }, async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const { user, account, session } = await AuthService.register(body, clientMeta(request), request);

    setSessionCookies(reply, session);
    return reply.status(201).send({
      message: 'Registration successful',
      token: session.accessToken,
      user,
      defaultAccount: account,
    });
  });

  fastify.post('/login', { preHandler: loginLimiter }, async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await AuthService.login(
      { email: body.email, password: body.password, totpCode: body.totp_code },
      clientMeta(request),
      request,
    );

    switch (result.status) {
      case 'ok':
        setSessionCookies(reply, result);
        return reply.send({ message: 'Login successful', token: result.accessToken, user: result.user });
      case 'mfa_required':
        return sendError(reply, 401, 'MFA_REQUIRED', 'Enter the 6-digit code from your authenticator app');
      case 'invalid_code':
        return sendError(reply, 401, 'INVALID_CODE', 'The authentication code is incorrect');
      case 'locked': {
        const retryAfter = Math.max(1, Math.ceil((result.lockedUntil.getTime() - Date.now()) / 1000));
        reply.header('Retry-After', String(retryAfter));
        return sendError(
          reply,
          423,
          'ACCOUNT_LOCKED',
          `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s) or reset your password.`,
          { retry_after_seconds: retryAfter },
        );
      }
      default:
        return sendError(reply, 401, 'UNAUTHORIZED', 'Invalid credentials');
    }
  });

  /** Exchanges the refresh cookie for a fresh access + refresh token pair (rotation). */
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) return sendError(reply, 401, 'UNAUTHORIZED', 'No refresh token');
    if (!hasTrustedOrigin(request)) return sendError(reply, 403, 'FORBIDDEN', 'Untrusted origin');

    const result = await SessionService.rotate(refreshToken, clientMeta(request));

    if (result.status === 'ok') {
      setSessionCookies(reply, result);
      return reply.send({ message: 'Session refreshed', token: result.accessToken });
    }

    if (result.status === 'reuse') {
      await AuditService.log({ userId: result.userId, action: 'auth.refresh.reuse_detected', request });
    }
    // 'race' keeps the cookies untouched: the other request already received the new pair
    if (result.status !== 'race') clearSessionCookies(reply);
    return sendError(reply, 401, 'UNAUTHORIZED', 'Session expired');
  });

  fastify.post('/logout', async (request, reply) => {
    // Works without a valid access token: a user with an expired one must still be able to sign out
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      const userId = await SessionService.revokeByRefreshToken(refreshToken, 'LOGOUT');
      if (userId) await AuditService.log({ userId, action: 'auth.logout', request });
    }
    clearSessionCookies(reply);
    return reply.send({ message: 'Logged out' });
  });

  fastify.post('/logout-all', { preHandler: verifyJwt }, async (request, reply) => {
    const count = await SessionService.revokeAll(request.userId, 'LOGOUT_ALL');
    await AuditService.log({ userId: request.userId, action: 'auth.logout_all', metadata: { sessions: count }, request });
    clearSessionCookies(reply);
    return reply.send({ message: 'Logged out everywhere', revoked: count });
  });

  fastify.get('/me', { preHandler: verifyJwt }, async (request, reply) => {
    const profile = await AuthService.getProfile(request.userId);
    if (!profile) {
      clearSessionCookies(reply);
      return sendError(reply, 401, 'UNAUTHORIZED', 'User not found');
    }
    return reply.send({ user: profile });
  });

  // ---- Active sessions ---------------------------------------------------------------------

  fastify.get('/sessions', { preHandler: verifyJwt }, async (request, reply) => {
    return reply.send({ sessions: await SessionService.listActive(request.userId, request.sessionId) });
  });

  fastify.delete('/sessions/:id', { preHandler: verifyJwt }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const revoked = await SessionService.revoke(request.userId, id, 'REVOKED_BY_USER');
    if (!revoked) return sendError(reply, 404, 'NOT_FOUND', 'Session not found');

    await AuditService.log({ userId: request.userId, action: 'auth.session.revoked', metadata: { sessionId: id }, request });
    if (id === request.sessionId) clearSessionCookies(reply);
    return reply.send({ message: 'Session revoked' });
  });

  // ---- Email verification ------------------------------------------------------------------

  fastify.post('/email/verify', { preHandler: strictLimiter }, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.body);
    await AuthService.verifyEmail(token, request);
    return reply.send({ message: 'Email verified' });
  });

  fastify.post('/email/resend', { preHandler: [verifyJwt, strictLimiter] }, async (request, reply) => {
    await AuthService.resendVerificationEmail(request.userId);
    return reply.send({ message: 'Verification email sent' });
  });

  // ---- Passwords ---------------------------------------------------------------------------

  fastify.post('/password/forgot', { preHandler: strictLimiter }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email().transform((e) => e.toLowerCase()) }).parse(request.body);
    await AuthService.requestPasswordReset(email, request);
    // Same answer whether or not the account exists
    return reply.send({ message: 'If an account exists for this email, a reset link has been sent' });
  });

  fastify.post('/password/reset', { preHandler: strictLimiter }, async (request, reply) => {
    const { token, password } = z.object({ token: z.string().min(10), password: Password }).parse(request.body);
    await AuthService.resetPassword(token, password, request);
    clearSessionCookies(reply);
    return reply.send({ message: 'Password updated. Please sign in again.' });
  });

  fastify.post('/password/change', { preHandler: [verifyJwt, strictLimiter] }, async (request, reply) => {
    const { current_password, new_password } = z
      .object({ current_password: z.string().min(1), new_password: Password })
      .parse(request.body);
    await AuthService.changePassword(request.userId, request.sessionId, current_password, new_password, request);
    return reply.send({ message: 'Password changed. Other devices have been signed out.' });
  });

  // ---- Two-factor authentication -----------------------------------------------------------

  fastify.post('/2fa/setup', { preHandler: verifyJwt }, async (request, reply) => {
    const { secret, otpauthUri } = await AuthService.beginTotpSetup(request.userId, request);
    return reply.send({ secret, otpauth_uri: otpauthUri });
  });

  fastify.post('/2fa/enable', { preHandler: [verifyJwt, strictLimiter] }, async (request, reply) => {
    const { code } = z.object({ code: OneTimeCode }).parse(request.body);
    await AuthService.enableTotp(request.userId, code, request);
    return reply.send({ message: 'Two-factor authentication enabled' });
  });

  fastify.post('/2fa/disable', { preHandler: [verifyJwt, strictLimiter] }, async (request, reply) => {
    const { password, code } = z.object({ password: z.string().min(1), code: OneTimeCode }).parse(request.body);
    await AuthService.disableTotp(request.userId, password, code, request);
    return reply.send({ message: 'Two-factor authentication disabled' });
  });

  // ---- Audit trail -------------------------------------------------------------------------

  fastify.get('/audit-log', { preHandler: verifyJwt }, async (request, reply) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return reply.send({ entries: await AuditService.listForUser(request.userId, limit) });
  });
}
