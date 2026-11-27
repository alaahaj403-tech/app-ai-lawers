import type { FastifyPluginAsync } from 'fastify';
import {
  confirmEmailSchema,
  deleteAccountSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@voxeli/api-contracts';
import { currentUser } from '../../plugins/auth.js';
import type { AccountService } from './service.js';

export interface AccountRoutesDeps {
  account: AccountService;
  authRateLimitMax: number;
}

export const accountRoutes: FastifyPluginAsync<AccountRoutesDeps> = async (app, deps) => {
  const strict = { config: { rateLimit: { max: deps.authRateLimitMax, timeWindow: '1 minute' } } };
  const ctx = (req: { correlationId: string; ip: string }) => ({
    correlationId: req.correlationId,
    ip: req.ip,
  });

  // -- verification: request needs a session; confirm needs only the token --
  app.post(
    '/auth/verify-email/request',
    { ...strict, preHandler: app.requireUser },
    async (req, reply) => {
      await deps.account.sendVerification(currentUser(req).sub, ctx(req));
      return reply.status(202).send({ accepted: true });
    },
  );
  app.post('/auth/verify-email/confirm', strict, async (req) => {
    const body = confirmEmailSchema.parse(req.body);
    await deps.account.confirmEmail(body.token, ctx(req));
    return { verified: true };
  });

  // -- password reset: never reveals whether the email exists ----------------
  app.post('/auth/password-reset/request', strict, async (req, reply) => {
    const body = passwordResetRequestSchema.parse(req.body);
    await deps.account.requestPasswordReset(body.email, ctx(req));
    return reply.status(202).send({ accepted: true });
  });
  app.post('/auth/password-reset/confirm', strict, async (req) => {
    const body = passwordResetConfirmSchema.parse(req.body);
    await deps.account.confirmPasswordReset(body.token, body.password, ctx(req));
    return { reset: true };
  });

  // -- account data ---------------------------------------------------------
  app.get('/account/export', { preHandler: app.requireUser }, async (req, reply) => {
    const data = await deps.account.exportAccount(currentUser(req).sub, ctx(req));
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', 'attachment; filename="voxeli-export.json"')
      .header('cache-control', 'private, no-store')
      .send(JSON.stringify(data, null, 2));
  });
  app.delete('/account', { ...strict, preHandler: app.requireUser }, async (req, reply) => {
    const body = deleteAccountSchema.parse(req.body);
    await deps.account.deleteAccount(currentUser(req).sub, body.password, ctx(req));
    return reply.status(204).send();
  });
};
