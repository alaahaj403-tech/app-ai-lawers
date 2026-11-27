import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { failures } from '@voxeli/domain';
import type { TokenService, AccessTokenClaims } from '../modules/auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AccessTokenClaims | null;
  }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync<{ tokens: TokenService }> = async (app, opts) => {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = await opts.tokens.verifyAccessToken(token);
    } catch {
      // Invalid token = anonymous. Routes decide whether that is acceptable.
      req.user = null;
    }
  });

  app.decorate('requireUser', async (req: FastifyRequest) => {
    if (!req.user) throw failures.auth();
  });
  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    if (!req.user) throw failures.auth();
    if (req.user.role !== 'admin') throw failures.forbidden();
  });
};

export const authPlugin = fp(plugin, { name: 'auth' });

/** Use inside routes guarded by requireUser; throws instead of asserting. */
export function currentUser(req: FastifyRequest): AccessTokenClaims {
  if (!req.user) throw failures.auth();
  return req.user;
}
