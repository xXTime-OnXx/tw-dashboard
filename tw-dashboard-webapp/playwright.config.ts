import { defineConfig } from '@playwright/test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1400, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @tw/dashboard dev --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      LOCAL_DATABASE_URL: testDatabaseUrl,
      DATABASE_URL: testDatabaseUrl,
    },
  },
  workers: 1,
});
