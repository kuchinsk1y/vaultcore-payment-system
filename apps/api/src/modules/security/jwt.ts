import jwt from 'jsonwebtoken';
import '../../config/env';
import { securityConfig } from './security.config';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-default-secret-key';

export interface AccessTokenPayload {
  userId: string;
  /** Session the token belongs to; lets revocation take effect before the token expires. */
  sid: string;
}

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ userId, sid: sessionId }, JWT_SECRET, {
    expiresIn: securityConfig.accessTokenTtlSeconds,
  });
}

/** Throws when the signature is invalid, the token expired, or it has no session id. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as Partial<AccessTokenPayload>;
  if (!decoded.userId || !decoded.sid) {
    throw new Error('Token is missing userId or sid');
  }
  return { userId: decoded.userId, sid: decoded.sid };
}
