import '../../config/env';

const int = (value: string | undefined, fallback: number) => {
  const n = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** Security-related settings, all overridable through environment variables. */
export const securityConfig = {
  /** Lifetime of the short-lived access token (JWT). */
  accessTokenTtlSeconds: int(process.env.ACCESS_TOKEN_TTL_SECONDS, 15 * 60),
  /** Lifetime of a session / refresh token (sliding: renewed on every rotation). */
  refreshTokenTtlSeconds: int(process.env.REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60),
  /** A just-rotated refresh token may be replayed within this window without being treated as theft. */
  refreshReuseGraceSeconds: int(process.env.REFRESH_REUSE_GRACE_SECONDS, 10),

  maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 5),
  lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
  loginRateLimitPerMinute: int(process.env.LOGIN_RATE_LIMIT, 10),

  emailVerificationTtlMinutes: 60 * 24,
  passwordResetTtlMinutes: 60,

  /** Transfers at or above this amount (minor units) need a one-time code. 0 disables confirmation. */
  largeTransferThreshold: int(process.env.LARGE_TRANSFER_THRESHOLD, 100_000),
  transferConfirmationTtlMinutes: 10,
  transferConfirmationMaxAttempts: 5,

  /** Base URL of the web app, used to build links in emails. */
  webUrl: process.env.WEB_URL || 'http://localhost:3000',
  totpIssuer: process.env.TOTP_ISSUER || 'PayCore',
};
