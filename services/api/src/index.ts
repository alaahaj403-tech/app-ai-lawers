import { buildApp } from './app.js';
import { loadEnv } from './env.js';

async function main() {
  const env = loadEnv();
  const { app, close } = await buildApp(env);
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
