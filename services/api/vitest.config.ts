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
      LOG_LEVEL: 'silent',
      // The auth limiter is exercised by a dedicated test with its own app
      // instance; a shared low limit would make every other test flaky.
      AUTH_RATE_LIMIT_MAX: '500',
    },
  },
});
