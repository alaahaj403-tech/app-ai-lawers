import { z } from 'zod';

/**
 * Credential shape guard. We do not attempt to validate the key itself — only
 * to reject pastes that are unmistakably broken, so the failure surfaces at
 * startup with a readable message instead of as a 401 in the middle of a run.
 */
const openAIKeySchema = z
  .string()
  .min(1)
  .refine((v) => !/\s/u.test(v), {
    message: 'must not contain whitespace (check for a wrapped or truncated paste)',
  })
  .refine((v) => !v.startsWith('sk-sk-'), {
    message:
      "must not start with a doubled 'sk-' prefix (the key was pasted onto an existing 'sk-')",
  });

/**
 * The subset of the environment that AI provider wiring needs. Tools that only
 * exercise the model routing path (the evaluation harness, one-off scripts)
 * validate against this instead of the full server schema, so they do not
 * require a database or JWT secret they never use.
 */
export const aiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** AI provider credentials — server-side only. Absent => mock provider in non-production. */
  OPENAI_API_KEY: openAIKeySchema.optional(),
  AI_PROVIDER: z.enum(['openai', 'mock']).optional(),
});

export type AIEnv = z.infer<typeof aiEnvSchema>;

/**
 * Server environment schema. Validated once at startup; the process fails fast
 * with a readable list of missing/invalid variables. Never log values.
 */
export const serverEnvSchema = aiEnvSchema.extend({
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

  /** Comma-separated allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export interface EnvValidation<T> {
  ok: true;
  env: T;
}
export interface EnvValidationFailure {
  ok: false;
  problems: string[];
}

/** Production must not run on the mock provider, and needs a real credential. */
function aiProductionProblems(env: AIEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.OPENAI_API_KEY && env.AI_PROVIDER !== 'mock') {
    problems.push('OPENAI_API_KEY is required in production (or set AI_PROVIDER=mock explicitly).');
  }
  if (env.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER=mock is not allowed in production.');
  return problems;
}

function issues(error: z.ZodError): string[] {
  // Names and reasons only — never values.
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export function validateServerEnv(
  raw: NodeJS.ProcessEnv,
): EnvValidation<ServerEnv> | EnvValidationFailure {
  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: issues(parsed.error) };
  const problems = aiProductionProblems(parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, env: parsed.data };
}

/**
 * Validates only what the AI provider wiring reads. Used by tooling that does
 * not build the HTTP app (evaluation harness, scripts).
 */
export function validateAIEnv(raw: NodeJS.ProcessEnv): EnvValidation<AIEnv> | EnvValidationFailure {
  const parsed = aiEnvSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: issues(parsed.error) };
  const problems = aiProductionProblems(parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, env: parsed.data };
}
