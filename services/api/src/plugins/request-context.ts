import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/** Correlation id per request; echoed back and attached to all logs. */
const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('correlationId', '');
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-correlation-id'];
    const id =
      typeof incoming === 'string' && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.correlationId = id;
    reply.header('x-correlation-id', id);
  });
};

export const requestContextPlugin = fp(plugin, { name: 'request-context' });
