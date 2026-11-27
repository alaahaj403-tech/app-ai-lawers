import { validateAIEnv, validateServerEnv } from '@voxeli/config';
import type { AIEnv, ServerEnv } from '@voxeli/config';

function unwrap<T>(result: { ok: true; env: T } | { ok: false; problems: string[] }): T {
  if (!result.ok) {
    // Names only — never values.
    throw new Error(`Invalid environment configuration:\n - ${result.problems.join('\n - ')}`);
  }
  return result.env;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): ServerEnv {
  return unwrap(validateServerEnv(raw));
}

/**
 * For tooling that only exercises AI routing (the evaluation harness). It does
 * not open a database or sign tokens, so it must not demand DATABASE_URL or
 * JWT_SECRET.
 */
export function loadAIEnv(raw: NodeJS.ProcessEnv = process.env): AIEnv {
  return unwrap(validateAIEnv(raw));
}
