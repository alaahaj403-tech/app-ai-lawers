import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type { ServerEnv } from '@voxeli/config';
import { createDb } from './db/client.js';
import type { Db } from './db/client.js';
import { createAIContainer } from './ai/container.js';
import { authPlugin } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { AccountService } from './modules/account/service.js';
import { accountRoutes } from './modules/account/routes.js';
import { AuditService } from './modules/audit/service.js';
import { ConsoleEmailProvider, ResendEmailProvider } from './modules/email/provider.js';
import type { EmailProvider } from './modules/email/provider.js';
import { AuthService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { TokenService } from './modules/auth/tokens.js';
import { FlagService } from './modules/flags/service.js';
import { adminFlagRoutes, flagRoutes } from './modules/flags/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { realtimeRoutes } from './modules/realtime/routes.js';
import { RelayRegistry, relayRoutes } from './modules/realtime/stream-routes.js';
import { speechRoutes } from './modules/speech/routes.js';
import { TranslationRepository } from './modules/translation/repository.js';
import { translationRoutes } from './modules/translation/routes.js';
import { QuotaService } from './modules/usage/quota.js';
import { DbUsageRecorder } from './modules/usage/recorder.js';

export interface BuiltApp {
  app: FastifyInstance;
  db: Db;
  /** Live Tier-2 relay sessions on this instance. */
  relayRegistry: RelayRegistry;
  close: () => Promise<void>;
}

/** Test seams. Production wiring ignores them. */
export interface AppOverrides {
  email?: EmailProvider;
  /** Shorten the relay's reconnect grace window in tests. */
  relayDetachGraceMs?: number;
}

export async function buildApp(
  env: ServerEnv,
  raw: NodeJS.ProcessEnv = process.env,
  overrides: AppOverrides = {},
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
  const email: EmailProvider =
    overrides.email ??
    (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM
      ? new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
      : new ConsoleEmailProvider(app.log));
  const account = new AccountService(db, email, audit, env.APP_BASE_URL, app.log);
  const auth = new AuthService(db, tokens, audit, env.REFRESH_TOKEN_TTL_DAYS);
  auth.onRegistered = (userId, ctx) => account.sendVerification(userId, ctx);
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
  // 64 KiB frames: ~1.3 s of PCM16 at 24 kHz, comfortably above any client chunk.
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(requestContextPlugin);
  await app.register(authPlugin, { tokens });
  registerErrorHandler(app);

  await app.register(healthRoutes, {
    db,
    router: ai.router,
    providerMode: ai.providerMode,
    emailProvider: email.id,
  });
  await app.register(authRoutes, {
    prefix: '/v1/auth',
    auth,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  });
  await app.register(accountRoutes, {
    prefix: '/v1',
    account,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  });
  await app.register(translationRoutes, {
    prefix: '/v1',
    translation: ai.translation,
    quota,
    repo,
    bindCorrelation,
  });
  await app.register(speechRoutes, { prefix: '/v1', router: ai.router, quota, bindCorrelation });
  const relayRegistry = new RelayRegistry();
  await app.register(relayRoutes, {
    prefix: '/v1/realtime',
    registry: relayRegistry,
    db,
    router: ai.router,
    translation: ai.translation,
    transcription: ai.transcription,
    quota,
    tokens,
    modelConfig: ai.modelConfig,
    ...(overrides.relayDetachGraceMs !== undefined
      ? { detachGraceMs: overrides.relayDetachGraceMs }
      : {}),
  });
  await app.register(realtimeRoutes, {
    prefix: '/v1/realtime',
    db,
    router: ai.router,
    quota,
    flags,
    tokens,
  });
  await app.register(flagRoutes, { prefix: '/v1', flags });
  await app.register(adminFlagRoutes, { prefix: '/v1/admin', flags, audit });

  app.log.info({ aiProvider: ai.providerMode }, 'app built');

  return {
    app,
    db,
    relayRegistry,
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
