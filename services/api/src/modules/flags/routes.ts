import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { featureFlagKeySchema } from '@voxeli/api-contracts';
import type { FeatureFlagsResponse } from '@voxeli/api-contracts';
import type { AuditService } from '../audit/service.js';
import type { FlagService } from './service.js';
import { currentUser } from '../../plugins/auth.js';

export const flagRoutes: FastifyPluginAsync<{ flags: FlagService }> = async (app, { flags }) => {
  app.get('/flags', async (): Promise<FeatureFlagsResponse> => {
    return { flags: await flags.all(), fetchedAt: new Date().toISOString() };
  });
};

export const adminFlagRoutes: FastifyPluginAsync<{
  flags: FlagService;
  audit: AuditService;
}> = async (app, { flags, audit }) => {
  app.addHook('preHandler', app.requireAdmin);
  app.put('/flags/:key', async (req) => {
    const { key } = z.object({ key: featureFlagKeySchema }).parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    await flags.set(key, enabled, currentUser(req).sub);
    await audit.log({
      actorUserId: currentUser(req).sub,
      action: 'admin.flag.set',
      targetType: 'feature_flag',
      targetId: key,
      correlationId: req.correlationId,
      ip: req.ip,
      metadata: { enabled },
    });
    return { key, enabled };
  });
};
