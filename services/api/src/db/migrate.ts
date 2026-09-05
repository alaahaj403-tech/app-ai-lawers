import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl, { max: 1 });
  try {
    const migrationsFolder = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../drizzle',
    );
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log('migrations applied');
      process.exit(0);
    })
    .catch((e: unknown) => {
      console.error('migration failed', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
