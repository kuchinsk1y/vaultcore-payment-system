import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createRateLimiter } from '../../infrastructure/middleware/rate-limiter';
import { requireVerifiedEmail, verifyJwt } from '../../infrastructure/middleware/jwt-auth';
import { AuditService } from '../audit/audit.service';
import { TransfersService } from './transfers.service';
import { TransferError, transferErrors } from './transfer.errors';
import { TransferConfirmationService, requiresConfirmation } from './transfer-confirmation.service';

const CreateTransferSchema = z.object({
  source_account_id: z.string().uuid(),
  destination_account_id: z.string().uuid(),
  amount: z.number().int().positive(), // in minor units
  currency: z.string().length(3),
  // Required (together) for transfers at or above the confirmation threshold
  confirmation_id: z.string().uuid().optional(),
  confirmation_code: z.string().regex(/^\d{6}$/).optional(),
});

export const transferRoutes: FastifyPluginAsync = async (fastify) => {
  // Strict rate limit: max 10 requests per 60 seconds per IP for transfers
  const transferRateLimiter = createRateLimiter(10, 60);

  fastify.post('/', { preHandler: [verifyJwt, requireVerifiedEmail, transferRateLimiter] }, async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Missing Idempotency-Key header' });
    }

    try {
      const existing = await TransfersService.findIdempotentResponse(idempotencyKey);
      if (existing) {
        return reply.status(existing.response_status).send(existing.response_body);
      }

      const data = CreateTransferSchema.parse(request.body);
      const details = {
        userId: request.userId,
        sourceAccountId: data.source_account_id,
        destinationAccountId: data.destination_account_id,
        amount: data.amount,
        currency: data.currency,
      };

      if (data.source_account_id === data.destination_account_id) throw transferErrors.sameAccount();
      await TransfersService.assessRisk(request.userId, data.source_account_id, data.amount);

      if (requiresConfirmation(data.amount)) {

        if (!data.confirmation_id || !data.confirmation_code) {
          // Not stored as an idempotent response: the client retries with the code
          const confirmation = await TransferConfirmationService.start(details, request);
          return reply.status(202).send({ status: 'CONFIRMATION_REQUIRED', ...confirmation });
        }
        await TransferConfirmationService.verifyAndConsume(details, data.confirmation_id, data.confirmation_code, request);
      }

      const transfer = await TransfersService.createTransfer({
        userId: request.userId,
        idempotencyKey,
        sourceAccountId: data.source_account_id,
        destinationAccountId: data.destination_account_id,
        amount: data.amount,
        currency: data.currency,
      });

      await AuditService.log({
        userId: request.userId,
        action: 'transfer.created',
        metadata: {
          transferId: transfer.id,
          amount: data.amount,
          currency: data.currency,
          source: data.source_account_id,
          destination: data.destination_account_id,
        },
        request,
      });

      return reply.status(201).send(transfer);
    } catch (error) {
      let status = 500;
      let body: Record<string, unknown> = { error: 'Internal Server Error' };

      if (error instanceof z.ZodError) {
        status = 400;
        body = { error: 'Bad Request', issues: error.issues };
      } else if (error instanceof TransferError) {
        status = error.status;
        body = error.body;
      } else if (isIdempotencyRace(error)) {
        // A concurrent request with the same key won the race: return its stored response
        const existing = await TransfersService.findIdempotentResponse(idempotencyKey);
        if (existing) {
          return reply.status(existing.response_status).send(existing.response_body);
        }
      } else {
        fastify.log.error(error);
      }

      // Persist client errors so retries with the same key get the same answer, except a wrong
      // confirmation code: the user must be able to retry the same transfer with the right one.
      const retryable = error instanceof TransferError && error.code === 'CONFIRMATION_INVALID';
      if (status >= 400 && status < 500 && !retryable) {
        try {
          await TransfersService.saveErrorResponse(idempotencyKey, status, body);
        } catch (e) {
          fastify.log.error(e, 'Failed to save idempotency key on error');
        }
      }

      return reply.status(status).send(body);
    }
  });
};

function isIdempotencyRace(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === '23505' && e?.constraint === 'idempotency_keys_pkey';
}
