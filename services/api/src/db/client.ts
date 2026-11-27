import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 10, onnotice: () => undefined });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}
