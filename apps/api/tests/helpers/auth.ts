import { db } from '../../src/infrastructure/database';
import { SessionService } from '../../src/modules/security/session.service';

/** Creates a real session for the user and returns a valid access token for it. */
export async function issueTestToken(userId: string): Promise<string> {
  const session = await SessionService.createSession(userId, { ip: '127.0.0.1', userAgent: 'vitest' });
  return session.accessToken;
}

/** Inserts a user whose email is already verified (so money-moving endpoints are reachable). */
export async function createVerifiedUser(email: string) {
  return db
    .insertInto('users')
    .values({ email, email_verified_at: new Date() })
    .returning(['id', 'email'])
    .executeTakeFirstOrThrow();
}
