import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';
import { AuditService } from '../audit/audit.service';
import { ExportQuerySchema, ListQuerySchema } from './transactions.query';
import { InvalidCursorError, TransactionsService } from './transactions.service';

export const transactionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyJwt);

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        code: 'BAD_REQUEST',
        message: error.issues.map((i) => i.message).join('; '),
        issues: error.issues,
      });
    }
    if (error instanceof InvalidCursorError) {
      return reply.status(400).send({ error: 'BAD_REQUEST', code: 'INVALID_CURSOR', message: 'Invalid cursor' });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' });
  });

  /**
   * GET /transactions: the user's ledger movements across all accounts, newest first.
   * Filters: account_id, direction, kind, from, to, q. Paging: limit + cursor (keyset, exact).
   */
  fastify.get('/', async (request, reply) => {
    const query = ListQuerySchema.parse(request.query);
    return reply.send(await TransactionsService.list(request.userId, query));
  });

  /** GET /transactions/export: the same filters as a CSV download (up to 5000 rows). */
  fastify.get('/export', async (request, reply) => {
    const filters = ExportQuerySchema.parse(request.query);
    const csv = await TransactionsService.exportCsv(request.userId, filters);

    await AuditService.log({ userId: request.userId, action: 'transactions.exported', request });

    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="transactions-${stamp}.csv"`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  });
};
