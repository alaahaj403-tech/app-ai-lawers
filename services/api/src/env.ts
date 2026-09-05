import { validateServerEnv } from '@voxeli/config';
import type { ServerEnv } from '@voxeli/config';

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = validateServerEnv(raw);
  if (!result.ok) {
    // Names only — never values.
    throw new Error(`Invalid environment configuration:\n - ${result.problems.join('\n - ')}`);
  }
  return result.env;
}
