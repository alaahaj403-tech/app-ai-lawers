import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { ServerEnv } from '@voxeli/config';
import { createDb } from './db/client.js';
import type { Db } from './db/client.js';
import { createAIContainer } from './ai/container.js';
import { authPlugin } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { AuditService } from './modules/audit/service.js';
import { AuthService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { TokenService } from './modules/auth/tokens.js';
import { FlagService } from './modules/flags/service.js';
import { adminFlagRoutes, flagRoutes } from './modules/flags/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { realtimeRoutes } from './modules/realtime/routes.js';
import { speechRoutes } from './modules/speech/routes.js';
import { TranslationRepository } from './modules/translation/repository.js';
import { translationRoutes } from './modules/translation/routes.js';
import { QuotaService } from './modules/usage/quota.js';
import { DbUsageRecorder } from './modules/usage/recorder.js';

export interface BuiltApp {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

export async function buildApp(
  env: ServerEnv,
  raw: NodeJS.ProcessEnv = process.env,
): Promise<BuiltApp> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.text',
          'req.body.refreshToken',
        ],
        censor: '[redacted]',
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
    bodyLimit: 64 * 1024,
    requestIdHeader: false,
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  const { db, close: closeDb } = createDb(env.DATABASE_URL);

  // Correlation → user binding for usage attribution (bounded map, entries expire quickly).
  const correlationUsers = new Map<string, { userId: string; at: number }>();
  const bindCorrelation = (cid: string, userId: string) => {
    correlationUsers.set(cid, { userId, at: Date.now() });
    if (correlationUsers.size > 10_000) {
      const cutoff = Date.now() - 60_000;
      for (const [k, v] of correlationUsers) if (v.at < cutoff) correlationUsers.delete(k);
    }
  };

  const usage = new DbUsageRecorder(
    db,
    app.log,
    (cid) => correlationUsers.get(cid)?.userId ?? null,
  );
  const ai = createAIContainer(env, usage, raw);
  const tokens = new TokenService(env);
  const audit = new AuditService(db);
  const auth = new AuthService(db, tokens, audit, env.REFRESH_TOKEN_TTL_DAYS);
  const quota = new QuotaService(db);
  const flags = new FlagService(db, env.NODE_ENV === 'test' ? 0 : 5_000);
  const repo = new TranslationRepository(db);

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    credentials: false,
    allowedHeaders: ['content-type', 'authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => req.user?.sub ?? req.ip,
    ...(env.REDIS_URL ? { redis: await createRedis(env.REDIS_URL) } : {}),
  });
  await app.register(requestContextPlugin);
  await app.register(authPlugin, { tokens });
  registerErrorHandler(app);

  await app.register(healthRoutes, { db, router: ai.router, providerMode: ai.providerMode });
  await app.register(authRoutes, { prefix: '/v1/auth', auth });
  await app.register(translationRoutes, {
    prefix: '/v1',
    translation: ai.translation,
    quota,
    repo,
    bindCorrelation,
  });
  await app.register(speechRoutes, { prefix: '/v1', router: ai.router, quota, bindCorrelation });
  await app.register(realtimeRoutes, {
    prefix: '/v1/realtime',
    db,
    router: ai.router,
    quota,
    flags,
  });
  await app.register(flagRoutes, { prefix: '/v1', flags });
  await app.register(adminFlagRoutes, { prefix: '/v1/admin', flags, audit });

  app.log.info({ aiProvider: ai.providerMode }, 'app built');

  return {
    app,
    db,
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}

async function createRedis(url: string) {
  const { Redis } = await import('ioredis');
  return new Redis(url, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}
