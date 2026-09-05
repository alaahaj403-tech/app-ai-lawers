import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://voxeli:voxeli@localhost:5432/voxeli_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      AI_PROVIDER: 'mock',
      // Blanked deliberately: the suite must never be able to reach a live
      // provider, and must not fail because of a developer's ambient key.
      OPENAI_API_KEY: '',
      LOG_LEVEL: 'silent',
    },
  },
});
