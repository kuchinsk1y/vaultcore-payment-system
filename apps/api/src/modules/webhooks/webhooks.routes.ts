import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';

const WebhookEventSchema = z.object({
  provider_event_id: z.string().min(1),
  event_type: z.string().min(1),
  payload: z.record(z.string(), z.any()), // flexible JSON payload
});

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/provider', async (request, reply) => {
    try {
      const data = WebhookEventSchema.parse(request.body);

      // Attempt to insert the webhook event
      await db
        .insertInto('webhook_events')
        .values({
          provider_event_id: data.provider_event_id,
          event_type: data.event_type,
          payload: JSON.stringify(data.payload),
          status: 'RECEIVED',
        })
        .execute();

      return reply.status(200).send({ status: 'RECEIVED' });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }

      // Check for Postgres unique constraint violation on provider_event_id
      // 23505 is the generic unique_violation code
      if (error.code === '23505' && error.constraint === 'webhook_events_provider_event_id_key') {
        // Idempotency: Webhook already received. Return 200 OK.
        fastify.log.info(`Duplicate webhook ignored: ${error.detail}`);
        return reply.status(200).send({ status: 'ALREADY_PROCESSED' });
      }

      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
