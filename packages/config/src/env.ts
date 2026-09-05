import { z } from 'zod';

/**
 * Server environment schema. Validated once at startup; the process fails fast
 * with a readable list of missing/invalid variables. Never log values.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url().optional(),

  /** 32+ byte secret for signing access tokens (HS256). Rotate via JWT_PREVIOUS_SECRET. */
  JWT_SECRET: z.string().min(32),
  JWT_PREVIOUS_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().default('voxeli'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  /** AI provider credentials — server-side only. Absent => mock provider in non-production. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(['openai', 'mock']).optional(),

  /** Public URL of the web app; used to build links in emails. */
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  /** console logs the email (dev/test); resend delivers through the Resend API. */
  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** e.g. "Voxeli <no-reply@voxeli.app>" */
  EMAIL_FROM: z.string().min(3).optional(),

  /** Comma-separated allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  /** Tighter budget for credential endpoints (login/register/refresh). */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export interface EnvValidation {
  ok: true;
  env: ServerEnv;
}
export interface EnvValidationFailure {
  ok: false;
  problems: string[];
}

export function validateServerEnv(raw: NodeJS.ProcessEnv): EnvValidation | EnvValidationFailure {
  const parsed = serverEnvSchema.safeParse(raw);
  if (parsed.success) {
    const env = parsed.data;
    const problems: string[] = [];
    if (env.NODE_ENV === 'production') {
      if (!env.OPENAI_API_KEY && env.AI_PROVIDER !== 'mock') {
        problems.push(
          'OPENAI_API_KEY is required in production (or set AI_PROVIDER=mock explicitly).',
        );
      }
      if (env.AI_PROVIDER === 'mock')
        problems.push('AI_PROVIDER=mock is not allowed in production.');
    }
    if (problems.length) return { ok: false, problems };
    return { ok: true, env };
  }
  const problems = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, problems };
}
