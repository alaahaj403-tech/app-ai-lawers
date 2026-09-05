import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { AIModelRouter } from '@voxeli/ai-core';
import type { Db } from '../../db/client.js';

export const healthRoutes: FastifyPluginAsync<{
  db: Db;
  router: AIModelRouter;
  providerMode: string;
  emailProvider: string;
}> = async (app, deps) => {
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
  app.get('/ready', async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
    } catch {
      return reply.status(503).send({ status: 'degraded', database: 'unreachable' });
    }
    return {
      status: 'ok',
      database: 'ok',
      aiProvider: deps.providerMode,
      emailProvider: deps.emailProvider,
      providerHealth: deps.router.healthSnapshot(),
    };
  });
};
