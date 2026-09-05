import type { FastifyPluginAsync } from 'fastify';
import {
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from '@voxeli/api-contracts';
import type { AuthService } from './service.js';
import { currentUser } from '../../plugins/auth.js';

export const authRoutes: FastifyPluginAsync<{ auth: AuthService }> = async (app, { auth }) => {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const ctx = (req: { correlationId: string; ip: string; headers: Record<string, unknown> }) => ({
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent:
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  });

  app.post('/register', strict, async (req, reply) => {
    const body = registerRequestSchema.parse(req.body);
    const res = await auth.register(body, ctx(req));
    return reply.status(201).send(res);
  });

  app.post('/login', strict, async (req) => {
    const body = loginRequestSchema.parse(req.body);
    return auth.login(body, ctx(req));
  });

  app.post(
    '/refresh',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const body = refreshRequestSchema.parse(req.body);
      return auth.refresh(body.refreshToken, ctx(req));
    },
  );

  app.post('/logout', async (req, reply) => {
    const body = logoutRequestSchema.parse(req.body ?? {});
    await auth.logout(body.refreshToken, req.user?.sid);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: app.requireUser }, async (req) => {
    return auth.profile(currentUser(req).sub);
  });
};
