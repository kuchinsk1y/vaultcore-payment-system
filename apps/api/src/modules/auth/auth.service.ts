import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { db } from '../../infrastructure/database';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../security/secret-box';
import { securityConfig } from '../security/security.config';
import { isLocked, registerFailure } from '../security/lockout';
import { getMailer } from '../security/mailer';
import { ClientMeta, SessionService } from '../security/session.service';
import { generateToken, hashToken } from '../security/tokens';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../security/totp';
import { verificationEmail, passwordResetEmail } from './auth.mail';
import type { FastifyRequest } from 'fastify';

type AuditRequest = Pick<FastifyRequest, 'ip' | 'headers' | 'log'>;

const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export interface RegisterInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  country: string;
  city?: string;
  zip_code?: string;
  street?: string;
}

export type LoginResult =
  | { status: 'ok'; user: { id: string; email: string; full_name: string | null }; accessToken: string; refreshToken: string }
  | { status: 'invalid_credentials' }
  | { status: 'mfa_required' }
  | { status: 'invalid_code' }
  | { status: 'locked'; lockedUntil: Date };

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function issueOneTimeToken(userId: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttlMinutes: number) {
  // Only the newest token of a purpose is valid
  await db
    .updateTable('one_time_tokens')
    .set({ used_at: new Date() })
    .where('user_id', '=', userId)
    .where('purpose', '=', purpose)
    .where('used_at', 'is', null)
    .execute();

  const token = generateToken();
  await db
    .insertInto('one_time_tokens')
    .values({ user_id: userId, purpose, token_hash: hashToken(token), expires_at: minutesFromNow(ttlMinutes) })
    .execute();
  return token;
}

/** Marks a valid, unused token as used and returns its owner, or null. Atomic: a token works once. */
async function consumeOneTimeToken(token: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
  const row = await db
    .updateTable('one_time_tokens')
    .set({ used_at: new Date() })
    .where('token_hash', '=', hashToken(token))
    .where('purpose', '=', purpose)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returning('user_id')
    .executeTakeFirst();
  return row?.user_id ?? null;
}

export const AuthService = {
  async register(input: RegisterInput, meta: ClientMeta, request?: AuditRequest) {
    const existing = await db.selectFrom('users').select('id').where('email', '=', input.email).executeTakeFirst();
    if (existing) throw new AuthError('CONFLICT', 409, 'User with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const full_name = `${input.first_name} ${input.last_name}`.trim();

    const { user, account } = await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({
          id: crypto.randomUUID(),
          email: input.email,
          password_hash: passwordHash,
          full_name,
          first_name: input.first_name,
          last_name: input.last_name,
          phone_number: input.phone_number,
          country: input.country,
          city: input.city,
          zip_code: input.zip_code,
          street: input.street,
        })
        .returning(['id', 'email', 'full_name', 'created_at'])
        .executeTakeFirstOrThrow();

      const account = await trx
        .insertInto('accounts')
        .values({ id: crypto.randomUUID(), user_id: user.id, currency: 'EUR', status: 'ACTIVE' })
        .returning(['id', 'currency', 'status'])
        .executeTakeFirstOrThrow();

      return { user, account };
    });

    const session = await SessionService.createSession(user.id, meta);
    await AuthService.sendVerificationEmail(user.id, user.email);
    await AuditService.log({ userId: user.id, action: 'auth.register', request });

    return { user, account, session };
  },

  async login(
    input: { email: string; password: string; totpCode?: string },
    meta: ClientMeta,
    request?: AuditRequest,
  ): Promise<LoginResult> {
    const user = await db
      .selectFrom('users')
      .select([
        'id',
        'email',
        'full_name',
        'password_hash',
        'failed_login_attempts',
        'locked_until',
        'totp_secret_encrypted',
        'totp_enabled_at',
        'totp_last_used_step',
      ])
      .where('email', '=', input.email)
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      await bcrypt.compare(input.password, DUMMY_HASH);
      await AuditService.log({ action: 'auth.login.failed', metadata: { reason: 'unknown_user' }, request });
      return { status: 'invalid_credentials' };
    }

    if (isLocked(user.locked_until)) {
      return { status: 'locked', lockedUntil: user.locked_until as Date };
    }

    const recordFailure = async (reason: string) => {
      const next = registerFailure(
        { attempts: user.failed_login_attempts, lockedUntil: user.locked_until },
        { maxAttempts: securityConfig.maxFailedLogins, lockMinutes: securityConfig.lockoutMinutes },
      );
      await db
        .updateTable('users')
        .set({ failed_login_attempts: next.attempts, locked_until: next.lockedUntil })
        .where('id', '=', user.id)
        .execute();

      await AuditService.log({ userId: user.id, action: 'auth.login.failed', metadata: { reason }, request });
      if (next.lockedUntil) {
        // Sessions stay valid, but nobody can start a new one for a while
        await AuditService.log({
          userId: user.id,
          action: 'auth.login.locked',
          metadata: { until: next.lockedUntil.toISOString() },
          request,
        });
        return { status: 'locked', lockedUntil: next.lockedUntil } as const;
      }
      return null;
    };

    if (!(await bcrypt.compare(input.password, user.password_hash))) {
      return (await recordFailure('bad_password')) ?? { status: 'invalid_credentials' };
    }

    let usedStep: number | null = null;
    if (user.totp_enabled_at && user.totp_secret_encrypted) {
      if (!input.totpCode) return { status: 'mfa_required' };

      usedStep = verifyTotp(decryptSecret(user.totp_secret_encrypted), input.totpCode, {
        lastUsedStep: user.totp_last_used_step === null ? null : Number(user.totp_last_used_step),
      });
      if (usedStep === null) {
        await AuditService.log({ userId: user.id, action: 'auth.2fa.failed', metadata: { stage: 'login' }, request });
        return (await recordFailure('bad_totp')) ?? { status: 'invalid_code' };
      }
    }

    await db
      .updateTable('users')
      .set({
        failed_login_attempts: 0,
        locked_until: null,
        ...(usedStep !== null ? { totp_last_used_step: usedStep } : {}),
      })
      .where('id', '=', user.id)
      .execute();

    const session = await SessionService.createSession(user.id, meta);
    await AuditService.log({ userId: user.id, action: 'auth.login.success', request });

    return {
      status: 'ok',
      user: { id: user.id, email: user.email, full_name: user.full_name },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  },

  // ---- Email verification ----------------------------------------------------------------

  async sendVerificationEmail(userId: string, email: string) {
    const token = await issueOneTimeToken(userId, 'EMAIL_VERIFICATION', securityConfig.emailVerificationTtlMinutes);
    const link = `${securityConfig.webUrl}/verify-email?token=${token}`;
    await getMailer().send(verificationEmail(email, link));
  },

  async resendVerificationEmail(userId: string) {
    const user = await db.selectFrom('users').select(['email', 'email_verified_at']).where('id', '=', userId).executeTakeFirstOrThrow();
    if (user.email_verified_at) throw new AuthError('ALREADY_VERIFIED', 400, 'Email is already verified');
    await AuthService.sendVerificationEmail(userId, user.email);
  },

  async verifyEmail(token: string, request?: AuditRequest) {
    const userId = await consumeOneTimeToken(token, 'EMAIL_VERIFICATION');
    if (!userId) throw new AuthError('INVALID_TOKEN', 400, 'This verification link is invalid or has expired');

    await db
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('id', '=', userId)
      .where('email_verified_at', 'is', null)
      .execute();
    await AuditService.log({ userId, action: 'auth.email.verified', request });
  },

  // ---- Passwords -------------------------------------------------------------------------

  /** Always resolves, whether or not the email exists, so it cannot be used to enumerate accounts. */
  async requestPasswordReset(email: string, request?: AuditRequest) {
    const user = await db.selectFrom('users').select(['id', 'email']).where('email', '=', email).executeTakeFirst();
    if (!user) return;

    const token = await issueOneTimeToken(user.id, 'PASSWORD_RESET', securityConfig.passwordResetTtlMinutes);
    const link = `${securityConfig.webUrl}/reset-password?token=${token}`;
    await getMailer().send(passwordResetEmail(user.email, link, securityConfig.passwordResetTtlMinutes));
    await AuditService.log({ userId: user.id, action: 'auth.password.reset_requested', request });
  },

  async resetPassword(token: string, newPassword: string, request?: AuditRequest) {
    const userId = await consumeOneTimeToken(token, 'PASSWORD_RESET');
    if (!userId) throw new AuthError('INVALID_TOKEN', 400, 'This reset link is invalid or has expired');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db
      .updateTable('users')
      .set({ password_hash: passwordHash, failed_login_attempts: 0, locked_until: null })
      .where('id', '=', userId)
      .execute();

    // A reset means the old credentials may be compromised: sign out everywhere
    await SessionService.revokeAll(userId, 'PASSWORD_RESET');
    await AuditService.log({ userId, action: 'auth.password.reset', request });
  },

  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    request?: AuditRequest,
  ) {
    const user = await db.selectFrom('users').select('password_hash').where('id', '=', userId).executeTakeFirstOrThrow();
    if (!user.password_hash || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw new AuthError('INVALID_PASSWORD', 400, 'Current password is incorrect');
    }

    await db
      .updateTable('users')
      .set({ password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) })
      .where('id', '=', userId)
      .execute();

    await SessionService.revokeAll(userId, 'PASSWORD_CHANGED', currentSessionId);
    await AuditService.log({ userId, action: 'auth.password.changed', request });
  },

  // ---- Two-factor authentication (TOTP) --------------------------------------------------

  /** Generates a secret and stores it (encrypted) but leaves 2FA disabled until a code is confirmed. */
  async beginTotpSetup(userId: string, request?: AuditRequest) {
    const user = await db.selectFrom('users').select(['email', 'totp_enabled_at']).where('id', '=', userId).executeTakeFirstOrThrow();
    if (user.totp_enabled_at) throw new AuthError('2FA_ALREADY_ENABLED', 400, 'Two-factor authentication is already enabled');

    const secret = generateTotpSecret();
    await db
      .updateTable('users')
      .set({ totp_secret_encrypted: encryptSecret(secret), totp_last_used_step: null })
      .where('id', '=', userId)
      .execute();

    await AuditService.log({ userId, action: 'auth.2fa.setup_started', request });
    return { secret, otpauthUri: otpauthUri(secret, user.email, securityConfig.totpIssuer) };
  },

  async enableTotp(userId: string, code: string, request?: AuditRequest) {
    const user = await db
      .selectFrom('users')
      .select(['totp_secret_encrypted', 'totp_enabled_at'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (user.totp_enabled_at) throw new AuthError('2FA_ALREADY_ENABLED', 400, 'Two-factor authentication is already enabled');
    if (!user.totp_secret_encrypted) throw new AuthError('2FA_NOT_STARTED', 400, 'Start the 2FA setup first');

    const step = verifyTotp(decryptSecret(user.totp_secret_encrypted), code);
    if (step === null) {
      await AuditService.log({ userId, action: 'auth.2fa.failed', metadata: { stage: 'enable' }, request });
      throw new AuthError('INVALID_CODE', 400, 'The code is incorrect');
    }

    await db
      .updateTable('users')
      .set({ totp_enabled_at: new Date(), totp_last_used_step: step })
      .where('id', '=', userId)
      .execute();
    await AuditService.log({ userId, action: 'auth.2fa.enabled', request });
  },

  async disableTotp(userId: string, password: string, code: string, request?: AuditRequest) {
    const user = await db
      .selectFrom('users')
      .select(['password_hash', 'totp_secret_encrypted', 'totp_enabled_at', 'totp_last_used_step'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    if (!user.totp_enabled_at || !user.totp_secret_encrypted) {
      throw new AuthError('2FA_NOT_ENABLED', 400, 'Two-factor authentication is not enabled');
    }
    if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AuthError('INVALID_PASSWORD', 400, 'Password is incorrect');
    }
    const step = verifyTotp(decryptSecret(user.totp_secret_encrypted), code, {
      lastUsedStep: user.totp_last_used_step === null ? null : Number(user.totp_last_used_step),
    });
    if (step === null) {
      await AuditService.log({ userId, action: 'auth.2fa.failed', metadata: { stage: 'disable' }, request });
      throw new AuthError('INVALID_CODE', 400, 'The code is incorrect');
    }

    await db
      .updateTable('users')
      .set({ totp_secret_encrypted: null, totp_enabled_at: null, totp_last_used_step: null })
      .where('id', '=', userId)
      .execute();
    await AuditService.log({ userId, action: 'auth.2fa.disabled', request });
  },

  async getProfile(userId: string) {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'email_verified_at', 'totp_enabled_at'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      email_verified: !!user.email_verified_at,
      two_factor_enabled: !!user.totp_enabled_at,
    };
  },
};
