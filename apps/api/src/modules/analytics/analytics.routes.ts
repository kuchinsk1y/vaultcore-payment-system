import { FastifyPluginAsync } from 'fastify';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';
import { AnalyticsService } from './analytics.service';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/summary', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      return reply.send(await AnalyticsService.getSummary(request.userId));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/portfolio', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const data = await AnalyticsService.getPortfolioSeries(request.userId);
      return reply.send({ status: 'success', data });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
