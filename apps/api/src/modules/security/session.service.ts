import { db } from '../../infrastructure/database';
import { signAccessToken } from './jwt';
import { securityConfig } from './security.config';
import { generateToken, hashToken } from './tokens';

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
}

export type RotationResult =
  | ({ status: 'ok'; userId: string } & IssuedSession)
  | { status: 'invalid' }
  /** An already-rotated refresh token was replayed: the whole session has been revoked. */
  | { status: 'reuse'; userId: string }
  /** A rotated token was replayed within the grace window (e.g. two tabs): no revocation. */
  | { status: 'race' };

const expiryFromNow = () => new Date(Date.now() + securityConfig.refreshTokenTtlSeconds * 1000);

export const SessionService = {
  async createSession(userId: string, meta: ClientMeta = {}): Promise<IssuedSession> {
    const refreshToken = generateToken();

    const session = await db
      .insertInto('sessions')
      .values({
        user_id: userId,
        refresh_token_hash: hashToken(refreshToken),
        user_agent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
        expires_at: expiryFromNow(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return { sessionId: session.id, accessToken: signAccessToken(userId, session.id), refreshToken };
  },

  /**
   * Exchanges a refresh token for a new access + refresh token pair. The old refresh token stops
   * working immediately; presenting it again is treated as token theft and revokes the session.
   */
  async rotate(presentedToken: string, meta: ClientMeta = {}): Promise<RotationResult> {
    const presentedHash = hashToken(presentedToken);
    const newRefreshToken = generateToken();
    const now = new Date();

    // Single atomic UPDATE: only one concurrent caller can win the rotation
    const rotated = await db
      .updateTable('sessions')
      .set({
        refresh_token_hash: hashToken(newRefreshToken),
        previous_refresh_token_hash: presentedHash,
        last_used_at: now,
        expires_at: expiryFromNow(),
        ip: meta.ip ?? null,
        user_agent: meta.userAgent?.slice(0, 300) ?? null,
      })
      .where('refresh_token_hash', '=', presentedHash)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .returning(['id', 'user_id'])
      .executeTakeFirst();

    if (rotated) {
      return {
        status: 'ok',
        userId: rotated.user_id,
        sessionId: rotated.id,
        accessToken: signAccessToken(rotated.user_id, rotated.id),
        refreshToken: newRefreshToken,
      };
    }

    // Not a valid current token. Was it a previously rotated one?
    const replayed = await db
      .selectFrom('sessions')
      .select(['id', 'user_id', 'last_used_at', 'revoked_at'])
      .where('previous_refresh_token_hash', '=', presentedHash)
      .executeTakeFirst();

    if (!replayed || replayed.revoked_at) return { status: 'invalid' };

    const ageSeconds = (now.getTime() - replayed.last_used_at.getTime()) / 1000;
    if (ageSeconds <= securityConfig.refreshReuseGraceSeconds) return { status: 'race' };

    await db
      .updateTable('sessions')
      .set({ revoked_at: now, revoked_reason: 'REFRESH_TOKEN_REUSE' })
      .where('id', '=', replayed.id)
      .where('revoked_at', 'is', null)
      .execute();

    return { status: 'reuse', userId: replayed.user_id };
  },

  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await db
      .selectFrom('sessions')
      .select('id')
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    return !!session;
  },

  async revoke(userId: string, sessionId: string, reason: string): Promise<boolean> {
    const result = await db
      .updateTable('sessions')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  },

  /** Revokes the session a refresh token belongs to. Returns the user id, or null if none matched. */
  async revokeByRefreshToken(refreshToken: string, reason: string): Promise<string | null> {
    const session = await db
      .updateTable('sessions')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('refresh_token_hash', '=', hashToken(refreshToken))
      .where('revoked_at', 'is', null)
      .returning('user_id')
      .executeTakeFirst();
    return session?.user_id ?? null;
  },

  /** Revokes every active session of the user, optionally keeping one (e.g. the current device). */
  async revokeAll(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    let query = db
      .updateTable('sessions')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null);

    if (exceptSessionId) query = query.where('id', '!=', exceptSessionId);

    const result = await query.executeTakeFirst();
    return Number(result.numUpdatedRows);
  },

  async listActive(userId: string, currentSessionId?: string) {
    const rows = await db
      .selectFrom('sessions')
      .select(['id', 'user_agent', 'ip', 'created_at', 'last_used_at', 'expires_at'])
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('last_used_at', 'desc')
      .execute();

    return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
  },
};
