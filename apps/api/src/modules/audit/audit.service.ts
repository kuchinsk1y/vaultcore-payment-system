import type { FastifyRequest } from 'fastify';
import { db } from '../../infrastructure/database';

export type AuditAction =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.login.locked'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.session.revoked'
  | 'auth.refresh.reuse_detected'
  | 'auth.email.verified'
  | 'auth.password.reset_requested'
  | 'auth.password.reset'
  | 'auth.password.changed'
  | 'auth.2fa.setup_started'
  | 'auth.2fa.enabled'
  | 'auth.2fa.disabled'
  | 'auth.2fa.failed'
  | 'transfer.created'
  | 'transfer.confirmation.requested'
  | 'transfer.confirmation.failed'
  | 'account.created'
  | 'account.closed'
  | 'card.issued'
  | 'card.frozen'
  | 'card.unfrozen'
  | 'card.pin_changed'
  | 'account.topped_up'
  | 'transactions.exported'
  | 'contact.added';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  /** The originating request, used to record IP address and user agent. */
  request?: Pick<FastifyRequest, 'ip' | 'headers' | 'log'>;
}

export const AuditService = {
  /**
   * Appends an entry to the audit log. Never throws: a logging failure must not break the
   * (already completed) business operation, but it is reported to the application log.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db
        .insertInto('audit_log')
        .values({
          user_id: entry.userId ?? null,
          action: entry.action,
          ip: entry.request?.ip ?? null,
          user_agent: (entry.request?.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
          metadata: JSON.stringify(entry.metadata ?? {}),
        })
        .execute();
    } catch (error) {
      (entry.request?.log ?? console).error({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  },

  async listForUser(userId: string, limit = 50) {
    return db
      .selectFrom('audit_log')
      .select(['id', 'action', 'ip', 'user_agent', 'metadata', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('id', 'desc')
      .limit(Math.min(limit, 200))
      .execute();
  },
};
