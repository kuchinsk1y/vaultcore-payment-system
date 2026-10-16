import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';

const CreateUserSchema = z.object({
  email: z.string().email(),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    try {
      const data = CreateUserSchema.parse(request.body);
      
      const [user] = await db.insertInto('users')
        .values({ email: data.email })
        .returning(['id', 'email', 'created_at'])
        .execute();
        
      return reply.status(201).send(user);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      
      // PostgreSQL unique violation error code
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'Conflict', message: 'Email already exists' });
      }

      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
