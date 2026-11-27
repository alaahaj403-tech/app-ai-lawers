import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/env.js';
import { buildApp } from '../src/app.js';
import type { BuiltApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

export async function startTestApp(): Promise<BuiltApp> {
  const env = loadEnv();
  await runMigrations(env.DATABASE_URL);
  await seed(env.DATABASE_URL);
  const built = await buildApp(env);
  await built.app.ready();
  return built;
}

export async function truncateAll(built: BuiltApp): Promise<void> {
  await built.db.execute(
    sql`truncate table users, audit_events, ai_usage, feature_flags restart identity cascade`,
  );
  await seed(loadEnv().DATABASE_URL);
}

export async function registerUser(
  built: BuiltApp,
  email: string,
  password = 'correct-horse-battery-staple',
) {
  const res = await built.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return res.json<{
    user: { id: string };
    tokens: { accessToken: string; refreshToken: string };
  }>();
}

export async function makeAdmin(built: BuiltApp, userId: string): Promise<void> {
  await built.db.execute(sql`update users set role = 'admin' where id = ${userId}`);
}

export async function setPlan(
  built: BuiltApp,
  userId: string,
  plan: 'free' | 'pro' | 'business',
): Promise<void> {
  await built.db.execute(
    sql`update subscriptions set plan = ${plan}::plan where user_id = ${userId}`,
  );
}
