import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';

const CreateAccountSchema = z.object({
  user_id: z.string().uuid(),
  currency: z.string().length(3),
});

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    try {
      const data = CreateAccountSchema.parse(request.body);
      
      const [account] = await db.insertInto('accounts')
        .values({
          user_id: data.user_id,
          currency: data.currency,
        })
        .returning(['id', 'user_id', 'currency', 'status', 'created_at'])
        .execute();
        
      return reply.status(201).send(account);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      
      // PostgreSQL foreign key violation error code
      if (error.code === '23503') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user_id' });
      }

      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
