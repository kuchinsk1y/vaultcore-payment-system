import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { db } from '../../infrastructure/database';
import { AuditService } from '../audit/audit.service';
import { transferCodeEmail } from '../auth/auth.mail';
import { decryptSecret } from '../security/secret-box';
import { securityConfig } from '../security/security.config';
import { getMailer } from '../security/mailer';
import { generateNumericCode, safeEqual } from '../security/tokens';
import { verifyTotp } from '../security/totp';
import { transferErrors } from './transfer.errors';

type AuditRequest = Pick<FastifyRequest, 'ip' | 'headers' | 'log'>;

export interface TransferDetails {
  userId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
}

/** Confirmations are bound to the exact transfer: changing any detail invalidates the code. */
export function hashTransferRequest(details: TransferDetails): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        details.userId,
        details.sourceAccountId,
        details.destinationAccountId,
        details.amount,
        details.currency,
      ]),
    )
    .digest('hex');
}

export function requiresConfirmation(amount: number): boolean {
  const threshold = securityConfig.largeTransferThreshold;
  return threshold > 0 && amount >= threshold;
}

const codeHash = (confirmationId: string, code: string) =>
  createHash('sha256').update(`${confirmationId}:${code}`).digest('hex');

export const TransferConfirmationService = {
  /**
   * Starts a confirmation for a large transfer. Users with an authenticator app confirm with a TOTP
   * code (nothing is sent); everyone else receives a one-time code by email.
   */
  async start(details: TransferDetails, request?: AuditRequest) {
    const user = await db
      .selectFrom('users')
      .select(['email', 'totp_enabled_at'])
      .where('id', '=', details.userId)
      .executeTakeFirstOrThrow();

    const method = user.totp_enabled_at ? 'TOTP' : 'EMAIL_OTP';
    const expiresAt = new Date(Date.now() + securityConfig.transferConfirmationTtlMinutes * 60_000);

    const row = await db
      .insertInto('transfer_confirmations')
      .values({
        user_id: details.userId,
        request_hash: hashTransferRequest(details),
        method,
        expires_at: expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (method === 'EMAIL_OTP') {
      const code = generateNumericCode(6);
      await db
        .updateTable('transfer_confirmations')
        .set({ code_hash: codeHash(row.id, code) })
        .where('id', '=', row.id)
        .execute();
      await getMailer().send(transferCodeEmail(user.email, code, securityConfig.transferConfirmationTtlMinutes));
    }

    await AuditService.log({
      userId: details.userId,
      action: 'transfer.confirmation.requested',
      metadata: { confirmationId: row.id, method, amount: details.amount, currency: details.currency },
      request,
    });

    return { confirmation_id: row.id, method, expires_at: expiresAt.toISOString() };
  },

  /** Verifies the code for this exact transfer and consumes the confirmation (single use). */
  async verifyAndConsume(details: TransferDetails, confirmationId: string, code: string, request?: AuditRequest) {
    const fail = async (reason: string) => {
      await AuditService.log({
        userId: details.userId,
        action: 'transfer.confirmation.failed',
        metadata: { confirmationId, reason },
        request,
      });
      return transferErrors.confirmationInvalid();
    };

    // Count the attempt first so parallel guesses cannot exceed the limit
    const row = await db
      .updateTable('transfer_confirmations')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', confirmationId)
      .where('user_id', '=', details.userId)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returning(['id', 'method', 'code_hash', 'request_hash', 'attempts'])
      .executeTakeFirst();

    if (!row) throw await fail('not_found_or_expired');
    if (row.attempts > securityConfig.transferConfirmationMaxAttempts) throw await fail('too_many_attempts');
    if (!safeEqual(row.request_hash, hashTransferRequest(details))) throw await fail('details_changed');

    let valid = false;
    if (row.method === 'TOTP') {
      const user = await db
        .selectFrom('users')
        .select(['totp_secret_encrypted', 'totp_last_used_step'])
        .where('id', '=', details.userId)
        .executeTakeFirstOrThrow();

      if (user.totp_secret_encrypted) {
        const step = verifyTotp(decryptSecret(user.totp_secret_encrypted), code, {
          lastUsedStep: user.totp_last_used_step === null ? null : Number(user.totp_last_used_step),
        });
        if (step !== null) {
          valid = true;
          await db.updateTable('users').set({ totp_last_used_step: step }).where('id', '=', details.userId).execute();
        }
      }
    } else if (row.code_hash) {
      valid = safeEqual(row.code_hash, codeHash(row.id, code));
    }

    if (!valid) throw await fail('wrong_code');

    // Atomic single use: of two concurrent requests with the same code, only one gets here
    const consumed = await db
      .updateTable('transfer_confirmations')
      .set({ consumed_at: new Date() })
      .where('id', '=', row.id)
      .where('consumed_at', 'is', null)
      .returning('id')
      .executeTakeFirst();

    if (!consumed) throw await fail('already_used');
  },
};
